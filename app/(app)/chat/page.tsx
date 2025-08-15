// app/(app)/chat/page.tsx
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { redirect } from 'next/navigation';
import Live from './live';
import { sendMessageAction, deleteThreadAction, markReadAction } from './actions';
import broker from './sse/broker';

export const dynamic = 'force-dynamic';

/* utils */
const toStr = (v: string | null | undefined) => (typeof v === 'string' ? v : '');
const now = () => new Date();
function requireSessionId(session: any): string {
  const id = session?.user?.id;
  if (typeof id !== 'string' || !id) redirect('/sign-in');
  return id;
}
const ROLES = ['director','deputy_plus','deputy','teacher_plus','teacher','Директор','Заместитель +','Заместитель','Педагог +','Педагог'];

/* ===== data helpers ===== */

type Row = { id:string; peerId:string; peerName:string; lastMessageAt:Date|null; lastMessageText:string|null; unreadCount:number; };

async function threadsWithUnread(uid: string): Promise<Row[]> {
  const rows = await prisma.thread.findMany({
    where: { OR:[{ aId: uid }, { bId: uid }] },
    orderBy: [{ lastMessageAt:'desc' }, { id:'asc' }],
    include: { a:{ select:{ id:true, name:true } }, b:{ select:{ id:true, name:true } } },
  });
  const ids = rows.map(r => r.id);
  if (ids.length === 0) return [];

  const list = await prisma.$queryRaw<{ threadId: string; count: bigint }[]>`
    SELECT m."threadId" as "threadId", COUNT(*)::bigint as "count"
    FROM "Message" m
    LEFT JOIN "ReadMark" r
      ON r."threadId" = m."threadId" AND r."userId" = ${uid}
    WHERE m."threadId" IN (${Prisma.join(ids)})
      AND (r."readAt" IS NULL OR m."createdAt" > r."readAt")
      AND m."authorId" <> ${uid}
    GROUP BY m."threadId"
  `;
  const unread = new Map(list.map(x => [x.threadId, Number(x.count)]));

  return rows.map(t => {
    const peer = t.aId === uid ? t.b : t.a;
    return {
      id: t.id,
      peerId: peer?.id ?? '',
      peerName: peer?.name ?? '—',
      lastMessageAt: t.lastMessageAt ?? null,
      lastMessageText: t.lastMessageText ?? null,
      unreadCount: unread.get(t.id) ?? 0,
    };
  });
}

const fmt = (d: Date) => {
  const M = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  return `${String(d.getDate()).padStart(2,'0')} ${M[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};
const isImg = (m?: string | null) => !!m && /^image\//.test(m);

/* авто-создание треда по ?start=<userId> */
async function ensureThread(me: string, otherIdRaw: string) {
  const otherId = otherIdRaw.trim();
  if (!otherId || otherId === me) return redirect('/chat');

  const existing = await prisma.thread.findFirst({
    where: { OR: [{ aId: me, bId: otherId }, { aId: otherId, bId: me }] },
    select: { id:true, aId:true, bId:true },
  });
  if (existing?.id) {
    broker.publish([existing.aId, existing.bId], { type:'threadCreated', threadId: existing.id, at: Date.now() });
    return redirect(`/chat?thread=${existing.id}`);
  }

  const created = await prisma.thread.create({ data: { aId: me, bId: otherId } });
  broker.publish([me, otherId], { type:'threadCreated', threadId: created.id, at: Date.now() });
  redirect(`/chat?thread=${created.id}`);
}

/* ========== page ========== */
export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const meId = requireSessionId(session);

  const sp = searchParams ? await searchParams : undefined;
  const get = (k: string) => { const v = sp?.[k]; return Array.isArray(v) ? v[0] : (v ?? null); };

  const threadId = toStr(get('thread'));
  const q        = toStr(get('q')).trim();
  const start    = toStr(get('start')).trim();

  if (start) { await ensureThread(meId, start); return null as any; }

  const threads = await threadsWithUnread(meId);

  const users = q
    ? await prisma.user.findMany({
        where: {
          role: { in: ROLES },
          NOT: [{ role: 'ghost' }, { role: 'archived' }, { id: meId }],
          OR: [
            { name:     { contains: q, mode:'insensitive' } },
            { email:    { contains: q, mode:'insensitive' } },
            { phone:    { contains: q, mode:'insensitive' } },
            { username: { contains: q, mode:'insensitive' } },
          ],
        },
        orderBy: [{ name: 'asc' }],
        select: { id:true, name:true, email:true, role:true },
        take: 20,
      })
    : [];

  const active = threadId
    ? await prisma.thread.findFirst({
        where: { id: threadId, OR: [{ aId: meId }, { bId: meId }] },
        include: { a:{ select:{ id:true, name:true } }, b:{ select:{ id:true, name:true } } },
      })
    : null;

  const peer = active ? (active.aId === meId ? active.b : active.a) : null;
  const peerIdStr = peer?.id ?? '';
  const peerName  = peer?.name ?? '—';

  const messages = threadId
    ? await prisma.message.findMany({
        where: { threadId },
        orderBy: { createdAt: 'asc' },
        select: {
          id:true, text:true, createdAt:true, authorId:true,
          attachments: { select: { id:true, name:true, mime:true, size:true, data:true } },
        },
      })
    : [];

  if (threadId) {
    await prisma.readMark.upsert({
      where: { threadId_userId: { threadId, userId: meId } },
      update: { readAt: now() },
      create: { threadId, userId: meId, readAt: now() },
    });
  }

  const peerReadAt =
    threadId && peerIdStr
      ? (await prisma.readMark.findUnique({
          where: { threadId_userId: { threadId, userId: peerIdStr } },
          select: { readAt:true },
        }))?.readAt ?? null
      : null;

  const unreadTotal = threads.reduce((s, t) => s + t.unreadCount, 0);

  return (
    <main style={{ padding:12, fontFamily:'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial' }}>
      <style>{`
        .chatGrid { display:grid; grid-template-columns:360px 1fr; gap:12px; min-height:560px; }
        .glass { background:linear-gradient(180deg, rgba(255,255,255,.70), rgba(255,255,255,.44));
                 backdrop-filter:saturate(180%) blur(12px); -webkit-backdrop-filter:saturate(180%) blur(12px);
                 border:1px solid rgba(229,231,235,.85); border-radius:12px;
                 box-shadow:0 6px 16px rgba(0,0,0,.06), inset 0 1px 0 rgba(255,255,255,.45); }
        .title { font-weight:900; font-size:18px; margin:0 0 6px; color:#0f172a; }
        .pill { display:inline-block; font-size:12px; padding:3px 8px; border-radius:9999px; background:#f3f4f6; border:1px solid rgba(229,231,235,.85); }
        .searchRow { display:flex; gap:8px; align-items:center; margin-top:6px; }
        .searchRow input { flex:1; height:36px; padding:6px 10px; border:1px solid rgba(229,231,235,.9); border-radius:10px; outline:none; background:#fff; }
        .res { margin-top:8px; }
        .res a { display:block; padding:10px; border:1px solid rgba(229,231,235,.9); border-radius:10px; background:#fff; text-decoration:none; color:#0f172a; }
        .res a + a { margin-top:6px; }
        .res a:hover { border-color:#c7e3ff; background:#f8fbff; }
        .thread { width:100%; text-align:left; padding:12px; min-height:66px; border-radius:12px; border:1px solid rgba(229,231,235,.9); background:#fff; position:relative; cursor:pointer; transition:background .12s, border-color .12s, transform .08s; }
        .thread + .thread { margin-top:8px; }
        .thread:hover { transform: translateY(-1px); border-color:#c7e3ff; }
        .thread--active { background:#eef6ff; border-color:#c7e3ff; }
        .thread .meta { font-size:12px; color:#6b7280; margin-top:4px; display:flex; gap:6px; align-items:center; }
        .badge { position:absolute; right:8px; top:8px; font-size:11px; line-height:18px; min-width:22px; text-align:center; padding:0 6px; border-radius:9999px; background:#8d2828; color:#fff; font-weight:800; }
        .chatbox { display:grid; grid-template-rows:auto 1fr auto; min-height:560px; }
        .messages { overflow:auto; padding:10px; }
        .msg { max-width:72%; margin:8px 0; padding:10px 12px; border-radius:12px; border:1px solid rgba(229,231,235,.8); background:#fff; box-shadow:0 4px 12px rgba(0,0,0,.04); }
        .msg.me { margin-left:auto; background:#fff; border-color:#dbeafe; }
        .msg .time { font-size:11px; color:#6b7280; margin-top:6px; display:flex; gap:6px; align-items:center; }
        .msg .checks { display:inline-flex; align-items:center; gap:2px; transform: translateY(1px); }
        .msg .checks .c { width:12px; height:12px; display:inline-block; border-bottom:2px solid #9ca3af; border-left:2px solid #9ca3af; transform: rotate(-45deg); border-radius:1px; }
        .msg.me .checks .c { border-color:#8d2828; }
        .msg .att { margin-top:6px; display:grid; gap:6px; }
        .att-img { display:block; max-width:440px; border-radius:10px; border:1px solid rgba(229,231,235,.8); }
        .composer { display:flex; gap:8px; padding:10px; border-top:1px solid rgba(229,231,235,.85); }
        .composer input[type="text"] { flex:1; height:40px; padding:8px 10px; border:1px solid rgba(229,231,235,.9); border-radius:10px; outline:none; background:#fff; }
        .btn { height:40px; padding:0 14px; border-radius:10px; border:1px solid rgba(229,231,235,.9); background:#fff; cursor:pointer; }
        .btn.primary { border-color:#c7e3ff; background:linear-gradient(180deg,#fff,#f8fbff); }
        .danger { color:#b91c1c; border-color:#ef4444; background:#fff; }
      `}</style>

      <div className="chatGrid">
        {/* LEFT */}
        <aside className="glass" style={{ padding:12 }}>
          <div className="title">чаты <span className="pill">{unreadTotal}</span></div>

          <form method="get" className="searchRow" role="search">
            <input type="text" name="q" placeholder="введите имя, почту, телефон…" defaultValue={q} autoComplete="off" />
          </form>

          {q ? (
            <div className="res">
              {users.length === 0 ? (
                <div className="pill">никого не найдено</div>
              ) : (
                users.map(u => (
                  <a key={u.id} href={`/chat?start=${encodeURIComponent(u.id)}`}>
                    <div style={{ fontWeight:700 }}>{u.name}</div>
                    <div style={{ fontSize:12, color:'#6b7280' }}>{u.email || '—'} {u.role ? `· ${u.role}` : ''}</div>
                  </a>
                ))
              )}
            </div>
          ) : null}

          <div style={{ marginTop:10 }}>
            {threads.length === 0 ? (
              <div className="pill">нет диалогов</div>
            ) : (
              threads.map(t => {
                const url = `/chat?thread=${encodeURIComponent(t.id)}`;
                const isActive = t.id === threadId;
                return (
                  <a key={t.id} href={url} className={`thread ${isActive ? 'thread--active' : ''}`}>
                    <div style={{ fontWeight:700, color:'#0f172a' }}>{t.peerName}</div>
                    <div className="meta">
                      {t.lastMessageAt ? <span>{fmt(t.lastMessageAt)}</span> : <span>нет сообщений</span>}
                      {t.lastMessageText ? <span>· {t.lastMessageText}</span> : null}
                    </div>
                    {t.unreadCount > 0 ? <span className="badge">{t.unreadCount > 99 ? '99+' : t.unreadCount}</span> : null}
                  </a>
                );
              })
            )}
          </div>

          <form action={deleteThreadAction} style={{ marginTop:12 }}>
            <input type="hidden" name="threadId" value={threadId} />
            <button className="btn danger" type="submit" disabled={!threadId}>удалить диалог</button>
          </form>
        </aside>

        {/* RIGHT */}
        <section className="glass chatbox">
          <header style={{ padding:'10px 12px', borderBottom:'1px solid rgba(229,231,235,.85)' }}>
            {threadId ? (
              <div className="title" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>{peerName}</span>
                <form action={markReadAction}>
                  <input type="hidden" name="threadId" value={threadId} />
                  <button className="btn" type="submit">отметить прочитанным</button>
                </form>
              </div>
            ) : (
              <div className="title">выберите диалог или найдите собеседника</div>
            )}
          </header>

          <div className="messages">
            {(!threadId || messages.length === 0) && <div className="pill" style={{ margin:10 }}>нет сообщений</div>}

            {messages.map(m => {
              const mine = m.authorId === meId;
              const read = peerReadAt ? peerReadAt >= m.createdAt : false;
              return (
                <div key={m.id} className={`msg ${mine ? 'me' : ''}`}>
                  {m.text ? <div style={{ whiteSpace:'pre-wrap' }}>{m.text}</div> : null}

                  {m.attachments.length ? (
                    <div className="att">
                      {m.attachments.map(att => {
                        if (isImg(att.mime)) {
                          const b64 = Buffer.from(att.data as unknown as Uint8Array).toString('base64');
                          return (
                            <img key={att.id} className="att-img" src={`data:${att.mime};base64,${b64}`} alt={att.name}
                                 title={`${att.name} · ${(att.size/1024).toFixed(1)} КБ`} />
                          );
                        }
                        return <div key={att.id} style={{ fontSize:13 }}>вложение: <strong>{att.name}</strong> ({(att.size/1024).toFixed(1)} КБ, {att.mime})</div>;
                      })}
                    </div>
                  ) : null}

                  <div className="time">
                    <span>{fmt(m.createdAt)}</span>
                    {mine ? (
                      <span className="checks" title={read ? 'прочитано' : 'доставлено'}>
                        <i className="c" /><i className="c" style={{ opacity: read ? 1 : .35 }} />
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <footer className="composer">
            <form action={sendMessageAction} style={{ display:'contents' }}>
              <input type="hidden" name="threadId" value={threadId} />
              <input type="text" name="text" placeholder="напишите сообщение…" disabled={!threadId} />
              <input className="btn" type="file" name="files" multiple disabled={!threadId} />
              <button className="btn primary" type="submit" disabled={!threadId}>отправить</button>
            </form>
          </footer>
        </section>
      </div>

      <Live uid={meId} activeThreadId={threadId || undefined} />
    </main>
  );
}

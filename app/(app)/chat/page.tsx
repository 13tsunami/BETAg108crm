// app/(app)/chat/page.tsx
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { redirect } from 'next/navigation';
import Live from './live';
import ChatBoxClient from './ChatBoxClient';
import s from './chat.module.css';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  peerId: string;
  peerName: string;
  lastMessageAt: Date | null;
  lastMessageText: string | null;
  unreadCount: number;
};

const ROLES = [
  'director', 'deputy_plus', 'deputy', 'teacher_plus', 'teacher',
  'Директор','Заместитель +','Заместитель','Педагог +','Педагог'
];

const toStr = (v: string | string[] | undefined): string =>
  typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? '') : '';

const now = () => new Date();
const fmt = (d: Date) => {
  const M = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  return `${String(d.getDate()).padStart(2,'0')} ${M[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

function requireSessionId(session: any): string {
  const id = session?.user?.id;
  if (typeof id !== 'string' || !id) redirect('/sign-in');
  return id;
}

async function threadsWithUnread(uid: string): Promise<Row[]> {
  const rows = await prisma.thread.findMany({
    where: { OR: [{ aId: uid }, { bId: uid }] },
    orderBy: [{ lastMessageAt: 'desc' }, { id: 'asc' }],
    include: { a: { select: { id:true, name:true } }, b: { select: { id:true, name:true } } },
  });

  if (!rows.length) return [];

  const ids = rows.map(r => r.id);
  const list = await prisma.$queryRaw<{ threadId: string; count: bigint }[]>`
    SELECT m."threadId" as "threadId", COUNT(*)::bigint as "count"
    FROM "Message" m
    LEFT JOIN "ReadMark" r
      ON r."threadId" = m."threadId" AND r."userId" = ${uid}
    LEFT JOIN "MessageHide" h
      ON h."messageId" = m."id" AND h."userId" = ${uid}
    WHERE m."threadId" IN (${Prisma.join(ids)})
      AND (r."readAt" IS NULL OR m."createdAt" > r."readAt")
      AND m."authorId" <> ${uid}
      AND h."messageId" IS NULL
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

async function ensureThread(me: string, otherIdRaw: string) {
  const otherId = otherIdRaw.trim();
  if (!otherId || otherId === me) return redirect('/chat');

  const existing = await prisma.thread.findFirst({
    where: { OR: [{ aId: me, bId: otherId }, { aId: otherId, bId: me }] },
    select: { id:true },
  });
  if (existing?.id) return redirect(`/chat?thread=${existing.id}`);

  const created = await prisma.thread.create({ data: { aId: me, bId: otherId } });
  return redirect(`/chat?thread=${created.id}`);
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const meId = requireSessionId(session);

  const sp = searchParams ? await searchParams : undefined;
  const get = (k: string) => toStr(sp?.[k]);

  const threadId = get('thread');
  const q        = get('q').trim();
  const start    = get('start').trim();

  if (start) { await ensureThread(meId, start); return null as any; }

  const threads = await threadsWithUnread(meId);

  // поиск людей — напрямую из БД
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
  const peerId = peer?.id ?? '';
  const peerName = peer?.name ?? '—';

  // история сообщений + скрытые для меня
  const rawMessages = threadId
    ? await prisma.message.findMany({
        where: { threadId },
        orderBy: { createdAt: 'asc' },
        select: {
          id:true, text:true, createdAt:true, authorId:true, editedAt:true, deletedAt:true,
          hides: { where: { userId: meId }, select: { userId:true } },
        },
      })
    : [];

  const messages = rawMessages.filter(m => (m.hides?.length ?? 0) === 0);

  // отметка о прочтении — сразу при заходе
  if (threadId) {
    await prisma.readMark.upsert({
      where: { threadId_userId: { threadId, userId: meId } },
      update: { readAt: now() },
      create: { threadId, userId: meId, readAt: now() },
    });
  }

  const peerReadAt =
    threadId && peerId
      ? (await prisma.readMark.findUnique({
          where: { threadId_userId: { threadId, userId: peerId } },
          select: { readAt:true },
        }))?.readAt ?? null
      : null;

  const unreadTotal = threads.reduce((s, t) => s + t.unreadCount, 0);

  return (
    <main style={{ padding:12, fontFamily:'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial' }}>
      <div className={s.chatRoot}>
        {/* ЛЕВАЯ КОЛОНКА — список диалогов + поиск */}
        <aside className={`${s.threads} ${s.glass}`}>
          <div className={s.blockTitle}>чаты <span className="pill" style={{
            display:'inline-block', fontSize:12, padding:'3px 8px', borderRadius:9999,
            background:'#f3f4f6', border:'1px solid rgba(229,231,235,.85)'
          }}>{unreadTotal}</span></div>

          {/* Поиск собеседника — прямой переход со стартом */}
          <form method="get" role="search" style={{ marginTop:8 }}>
            <input className={s.searchInput} type="text" name="q" placeholder="введите имя, почту, телефон…" defaultValue={q} autoComplete="off" />
          </form>

          {q ? (
            <div style={{ marginTop:10 }}>
              {users.length === 0 ? (
                <div className="pill" style={{
                  display:'inline-block', fontSize:12, padding:'3px 8px', borderRadius:9999,
                  background:'#f3f4f6', border:'1px solid rgba(229,231,235,.85)'
                }}>никого не найдено</div>
              ) : (
                users.map(u => (
                  <a key={u.id} href={`/chat?start=${encodeURIComponent(u.id)}`} className={s.thread} style={{ display:'block', marginTop:8 }}>
                    <div style={{ fontWeight:700 }}>{u.name}</div>
                    <div style={{ fontSize:12, color:'#6b7280' }}>{u.email || '—'} {u.role ? `· ${u.role}` : ''}</div>
                  </a>
                ))
              )}
            </div>
          ) : null}

          <div style={{ marginTop:10 }}>
            {threads.length === 0 ? (
              <div className="pill" style={{
                display:'inline-block', fontSize:12, padding:'3px 8px', borderRadius:9999,
                background:'#f3f4f6', border:'1px solid rgba(229,231,235,.85)'
              }}>нет диалогов</div>
            ) : (
              threads.map(t => {
                const url = `/chat?thread=${encodeURIComponent(t.id)}`;
                const isActive = t.id === threadId;
                return (
                  <a key={t.id} href={url} className={`${s.thread} ${isActive ? s.threadActive : ''}`} style={{ display:'block', marginTop:8 }}>
                    <div style={{ fontWeight:700, color:'#0f172a' }}>{t.peerName}</div>
                    <div style={{ fontSize:12, color:'#6b7280', marginTop:4, display:'flex', gap:6, alignItems:'center' }}>
                      {t.lastMessageAt ? <span>{fmt(t.lastMessageAt)}</span> : <span>нет сообщений</span>}
                      {t.lastMessageText ? <span>· {t.lastMessageText}</span> : null}
                    </div>
                    {t.unreadCount > 0 ? (
                      <span className={s.badge}>{t.unreadCount > 99 ? '99+' : t.unreadCount}</span>
                    ) : null}
                  </a>
                );
              })
            )}
          </div>
        </aside>

        {/* ПРАВАЯ ПАНЕЛЬ — лента + композер на клиенте, без API */}
        <section className={`${s.pane} ${s.glass}`} style={{ display:'grid', gridTemplateRows:'auto 1fr auto', gap:12 }}>
          <header style={{ padding:'10px 12px', borderBottom:'1px solid rgba(229,231,235,.85)' }}>
            {threadId ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontWeight:900, fontSize:18, color:'#0f172a' }}>{peerName}</div>
                {/* markRead — server action вызывается внутри ChatBoxClient при клике/скролле, но кнопка тоже не помешает */}
              </div>
            ) : (
              <div style={{ fontWeight:900, fontSize:18, color:'#0f172a' }}>выберите диалог или найдите собеседника</div>
            )}
          </header>

          <ChatBoxClient
            meId={meId}
            threadId={threadId || ''}
            peerReadAtIso={peerReadAt ? peerReadAt.toISOString() : null}
            initial={messages.map(m => ({
              id: m.id,
              text: m.text,
              ts: m.createdAt.toISOString(),
              authorId: m.authorId,
              edited: !!m.editedAt,
              deleted: !!m.deletedAt,
            }))}
          />
        </section>
      </div>

      {/* SSE — остаётся, чтобы дёргать router.refresh() и подтягивать свежие данные напрямую из БД */}
      <Live uid={meId} activeThreadId={threadId || undefined} />
    </main>
  );
}

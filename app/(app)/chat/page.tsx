import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Live from './live';
import ChatBoxClient from './ChatBoxClient';
import SearchBox from './SearchBox';
import s from './chat.module.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const meId = requireSessionId(session);
  const meName = (session?.user as any)?.name ?? 'Вы';

  const sp = await searchParams;
  const get = (k: string) => toStr(sp?.[k]);

  const threadId = get('thread');
  const q        = get('q').trim();
  const start    = get('start').trim();

  if (start) {
    // redirect сработает и оборвёт рендер, никакого return null
    return ensureThread(meId, start);
  }

  let active:
    | { id: string; aId: string; bId: string; a: { id: string; name: string | null }; b: { id: string; name: string | null } }
    | null = null;

  if (threadId) {
    active = await prisma.thread.findFirst({
      where: { id: threadId, OR: [{ aId: meId }, { bId: meId }] },
      include: { a:{ select:{ id:true, name:true } }, b:{ select:{ id:true, name:true } } },
    });
    if (!active) redirect('/chat');
  }

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

  const peer = active ? (active.aId === meId ? active.b : active.a) : null;
  const peerId = peer?.id ?? '';
  const peerName = peer?.name ?? '—';

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

  if (threadId && active) {
    await prisma.readMark.upsert({
      where: { threadId_userId: { threadId, userId: meId } },
      update: { readAt: now() },
      create: { threadId, userId: meId, readAt: now() },
    });
  }

  const peerReadAt =
    threadId && active && peerId
      ? (await prisma.readMark.findUnique({
          where: { threadId_userId: { threadId, userId: peerId } },
          select: { readAt:true },
        }))?.readAt ?? null
      : null;

  return (
    <main style={{ padding:12, fontFamily:'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial' }}>
      <div className={s.chatRoot}>
        {/* ЛЕВАЯ КОЛОНКА */}
        <aside className={`${s.threads} ${s.glass}`}>
          <div className={s.blockTitle}>чаты</div>

          {/* Поиск собеседника — автосабмит без Enter */}
          <div className={s.searchBlock}>
            <div className={s.searchRow}>
              <SearchBox initialQuery={q} />
            </div>

            {!!q && (
              <div className={s.dd}>
                {users.length === 0 && <div className={s.ddItem} style={{ color:'#6b7280' }}>ничего не найдено</div>}
                {users.map(u => (
                  <form key={u.id} action="/chat" method="get">
                    <input type="hidden" name="start" value={u.id} />
                    <button className={s.ddItem} type="submit" title={u.email ?? ''}>
                      {u.name || u.email || u.id}
                    </button>
                  </form>
                ))}
              </div>
            )}
          </div>

          {/* Список диалогов */}
          <div className={s.block} style={{ paddingTop:16 }}>
            {threads.length === 0 && <div style={{ color:'#6b7280' }}>диалогов пока нет</div>}

            {threads.map(t => {
              const activeCls = t.id === threadId ? s.threadActive : '';
              const unreadCls = t.unreadCount > 0 ? s.threadUnread : '';
              const initials = (t.peerName || '—').trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase();

              return (
                <div key={t.id} className={s.threadWrap}>
                  <Link className={`${s.thread} ${activeCls} ${unreadCls}`} href={`/chat?thread=${t.id}`}>
                    <div className={s.threadTop}>
                      <div className={s.peer}>
                        <div className={s.avatar}>{initials || '•'}</div>
                        <div className={s.threadName}>{t.peerName}</div>
                      </div>
                      <div className={s.threadDate}>
                        {t.lastMessageAt ? fmt(t.lastMessageAt) : '—'}
                      </div>
                    </div>
                    {t.lastMessageText ? (
                      <div className={`${s.threadLast}`}>
                        {t.lastMessageText}
                      </div>
                    ) : null}
                  </Link>

                  {t.unreadCount > 0 && <div className={s.badge}>{t.unreadCount}</div>}

                  <form action="/chat" method="get">
                    <input type="hidden" name="thread" value={t.id} />
                    <button className={s.btnDel} title="удалить диалог" formAction={`/chat?thread=${t.id}`}>
                      <svg className={s.btnDelIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M3 6h18M9 6v12m6-12v12M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeWidth="2" />
                      </svg>
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ПРАВАЯ ПАНЕЛЬ */}
        <section className={`${s.pane} ${s.glass}`} style={{ display:'grid', gridTemplateRows:'auto 1fr auto', gap:12 }}>
          <header style={{ padding:'10px 12px', borderBottom:'1px solid rgba(229,231,235,.85)' }}>
            {threadId ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontWeight:900, fontSize:18, color:'#0f172a' }}>{peerName}</div>
              </div>
            ) : (
              <div style={{ fontWeight:900, fontSize:18, color:'#0f172a' }}>выберите диалог или найдите собеседника</div>
            )}
          </header>

          <ChatBoxClient
            meId={meId}
            meName={meName}
            peerName={peerName}
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

      <Live uid={meId} activeThreadId={threadId || undefined} />
    </main>
  );
}

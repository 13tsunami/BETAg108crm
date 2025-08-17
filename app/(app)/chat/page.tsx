// app/(app)/chat/page.tsx
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole } from '@/lib/roles';
import ChatBoxClient from './ChatBoxClient';
import DeleteThreadButton from './DeleteThreadButton';
import SearchBox from './SearchBox';
import styles from './chat.module.css';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ChatPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  const session = await auth();
  if (!session?.user?.id) {
    return <main className={styles.chatRoot}>Не авторизовано</main>;
  }

  const meId = session.user.id;
  const meName = session.user.name ?? '—';
  const role = normalizeRole(session.user.role); // оставляем, если используешь дальше

  const threads = await prisma.thread.findMany({
    where: { OR: [{ aId: meId }, { bId: meId }] },
    include: {
      a: { select: { id: true, name: true } },
      b: { select: { id: true, name: true } },
      readMarks: { where: { userId: meId } },
    },
    orderBy: [{ lastMessageAt: 'desc' }, { id: 'asc' }],
  });

  const activeThreadId =
    typeof sp.thread === 'string' ? sp.thread : Array.isArray(sp.thread) ? sp.thread[0] : undefined;

  const active = activeThreadId ? threads.find((t) => t.id === activeThreadId) : undefined;
  const peerName =
    active ? (active.aId === meId ? active.b.name ?? '—' : active.a.name ?? '—') : '—';
  const peerReadAtIso =
    active?.readMarks?.[0]?.readAt ? active.readMarks[0].readAt.toISOString() : null;

  return (
    <main className={styles.chatRoot}>
      {/* Левая колонка – список тредов */}
      <section className={styles.threads}>
        <div style={{ padding: '8px 8px 12px' }}>
          <SearchBox />
        </div>

        {threads.length === 0 && (
          <div style={{ fontSize: 13, color: '#6b7280' }}>Нет чатов</div>
        )}

        {threads.map((t) => {
          const peer = t.aId === meId ? t.b : t.a;
          const lastMsgAt = t.lastMessageAt
            ? new Date(t.lastMessageAt).toLocaleString('ru-RU', {
                dateStyle: 'short',
                timeStyle: 'short',
              })
            : '';
          const unread =
            !t.readMarks[0] || (t.lastMessageAt && t.readMarks[0].readAt < t.lastMessageAt);

          return (
            <a
              key={t.id}
              href={`/chat?thread=${t.id}`}
              className={`${styles.thread} ${t.id === activeThreadId ? styles.threadActive : ''}`}
            >
              <div className={styles.threadTop}>
                <span className={styles.threadName}>{peer.name ?? '—'}</span>
                {unread && <span className={styles.unreadDot} />}
              </div>

              <div className={styles.threadBottom}>
                <span className={styles.threadPreview}>{t.lastMessageText ?? ''}</span>
                <span className={styles.threadDate}>{lastMsgAt}</span>
              </div>

              {/* Кнопка удаления треда (с подтверждением) */}
              <DeleteThreadButton threadId={t.id} />
            </a>
          );
        })}
      </section>

      {/* Правая колонка – сам чат */}
      <section className={styles.chatBox}>
        {activeThreadId ? (
          <ChatBoxClient
            meId={meId}
            meName={meName}
            threadId={activeThreadId}
            peerName={peerName}
            peerReadAtIso={peerReadAtIso}
            initial={[]}
          />
        ) : (
          <div style={{ fontSize: 13, color: '#6b7280' }}>Выберите чат слева</div>
        )}
      </section>
    </main>
  );
}

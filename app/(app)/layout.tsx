// app/(app)/layout.tsx
import type { ReactNode } from 'react';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import Sidebar from '@/components/Sidebar';
import Heartbeat from './heartbeat/Heartbeat';
import { heartbeat } from './heartbeat/actions';
import { unstable_noStore as noStore } from 'next/cache';
import { getUnreadTasksCount } from '@/lib/tasks/getUnreadTasks';
import { getUnreadReviewsCount, getUnreadDiscussionsCount, getUnreadRequestsCount } from '../../lib/unread.server';


export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function unreadTotal(uid: string) {
  noStore();
  const threads = await prisma.thread.findMany({
    where: { OR: [{ aId: uid }, { bId: uid }] },
    select: { id: true },
  });
  const ids = threads.map(t => t.id);
  if (ids.length === 0) return 0;

  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "Message" m
    LEFT JOIN "ReadMark" r
      ON r."threadId" = m."threadId" AND r."userId" = ${uid}
    WHERE m."threadId" IN (${Prisma.join(ids)})
      AND (r."readAt" IS NULL OR m."createdAt" > r."readAt")
      AND m."authorId" <> ${uid}
  `;
  return Number(rows[0]?.count ?? 0);
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const uid = (session?.user as any)?.id as string | undefined;

  const [unreadChats, unreadTasks, unreadReviews, unreadDiscussions, unreadRequests] = uid
    ? await Promise.all([
        unreadTotal(uid),
        getUnreadTasksCount(uid),
        getUnreadReviewsCount(uid),
        getUnreadDiscussionsCount(uid),
        getUnreadRequestsCount(uid),
      ])
    : [0, 0, 0, 0, 0];

  return (
    <div id="app-shell" className={styles.appShell}>
      <aside className={styles.appSidebar}>
        <Sidebar
          unreadChats={unreadChats}
          unreadTasks={unreadTasks}
          unreadReviews={unreadReviews}
          unreadDiscussions={unreadDiscussions}
          unreadRequests={unreadRequests}
        />
      </aside>
      <main className={styles.appMain}>
        {children}
        <Heartbeat action={heartbeat} />
      </main>
    </div>
  );
}

// ВАЖНО: не забудьте импорт модуля стилей
import styles from './layout.module.css';

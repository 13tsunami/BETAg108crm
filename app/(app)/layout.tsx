import type { ReactNode } from 'react';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import Sidebar from '@/components/Sidebar';
import Heartbeat from './heartbeat/Heartbeat';
import { heartbeat } from './heartbeat/actions';

async function unreadTotal(uid: string) {
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
  const unread = uid ? await unreadTotal(uid) : 0;

  return (
    <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', minHeight:'100vh' }}>
      <Sidebar unreadChats={unread} />
      <main style={{ padding:12 }}>
        {children}
        <Heartbeat action={heartbeat} />
      </main>
    </div>
  );
}

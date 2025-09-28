import { NextResponse } from 'next/server';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q || q.length < 1) return NextResponse.json([]);

  // Поиск по началу: ФИО (name ILIKE 'q%') либо username ILIKE 'q%'
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { startsWith: q, mode: 'insensitive' } },
        { username: { startsWith: q, mode: 'insensitive' } },
      ],
    },
    select: { username: true, name: true },
    orderBy: [{ name: 'asc' }],
    take: 8,
  });

  // фильтруем тех, у кого нет username: тэг должен вставляться как @username
  const prepared = users.filter(u => !!u.username).map(u => ({
    username: u.username as string,
    name: u.name ?? '',
  }));

  return NextResponse.json(prepared);
}

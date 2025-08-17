import { NextResponse } from 'next/server';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json([], { status: 200 });

  const session = await auth();
  const meId = (session as any)?.user?.id as string | undefined;

  // Ищем только по ФИО, без e-mail/тел/username. Регистр — нечувствителен.
  const users = await prisma.user.findMany({
    where: {
      id: { not: meId || undefined },
      name: { contains: q, mode: 'insensitive' },
      // при желании можно ограничить по ролям, как в других местах
    },
    orderBy: [{ name: 'asc' }],
    select: { id: true, name: true },
    take: 30,
  });

  return NextResponse.json(users, { status: 200 });
}

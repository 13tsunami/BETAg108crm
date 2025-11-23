// app/api/fortune-cookie/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@/auth.config';
import { getDailyFortune } from '@/lib/fortuneCookie';

export async function GET() {
  const session = await auth();

  const userId = session?.user?.id ?? null;
  const displayName = session?.user?.name ?? null;
  const role = (session as any)?.user?.role ?? null; // при желании можно типизировать жёстче

  const result = getDailyFortune({
    userId,
    displayName,
    role,
  });

  return NextResponse.json(result);
}

'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth.config';

// тихий пульс: обновляем lastSeen и выходим (без redirect/revalidate)
export async function heartbeat(): Promise<void> {
  const session = await auth();
  const id = (session?.user as any)?.id as string | undefined;
  if (!id) return;
  try {
    await prisma.user.update({
      where: { id },
      data: { lastSeen: new Date() },
    });
  } catch {
    // тишина: пульс не должен ломать навигацию
  }
}

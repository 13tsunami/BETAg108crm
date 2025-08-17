'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth.config';

export async function deleteThreadAction(threadId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Не авторизовано');

  const meId = session.user.id;
  const thread = await prisma.thread.findUnique({ where: { id: threadId } });
  if (!thread) throw new Error('Диалог не найден');
  if (thread.aId !== meId && thread.bId !== meId) throw new Error('Нет доступа');

  await prisma.thread.delete({ where: { id: threadId } });
}

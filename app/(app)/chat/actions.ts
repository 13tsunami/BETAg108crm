// app/(app)/chat/actions.ts
'use server';

import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import broker from './sse/broker';
import { redirect } from 'next/navigation';

const now = () => new Date();
const toStr = (v: unknown) => (typeof v === 'string' ? v : '');

function requireUserId(session: any): string {
  const id = session?.user?.id;
  if (typeof id !== 'string' || !id) redirect('/sign-in');
  return id;
}

async function participantsOf(threadId: string): Promise<[string, string]> {
  const th = await prisma.thread.findUnique({ where: { id: threadId }, select: { aId: true, bId: true } });
  return [th?.aId || '', th?.bId || ''] as [string, string];
}

export async function sendMessageAction(fd: FormData): Promise<void> {
  const session = await auth();
  const me = requireUserId(session);
  const threadId = toStr(fd.get('threadId')).trim();
  const text = toStr(fd.get('text')).trim();
  if (!threadId || !text) return;

  const th = await prisma.thread.findFirst({
    where: { id: threadId, OR: [{ aId: me }, { bId: me }] },
    select: { aId: true, bId: true },
  });
  if (!th) return;

  const created = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({
      data: { threadId, authorId: me, text },
      select: { id: true, createdAt: true, authorId: true, text: true },
    });

    await tx.thread.update({
      where: { id: threadId },
      data: { lastMessageAt: m.createdAt, lastMessageText: m.text },
    });

    await tx.readMark.upsert({
      where: { threadId_userId: { threadId, userId: me } },
      update: { readAt: now() },
      create: { threadId, userId: me, readAt: now() },
    });

    return m;
  });

  broker.publish([th.aId, th.bId], {
    type: 'message',
    threadId,
    at: Date.now(),
    messageId: created.id,
    authorId: created.authorId,
    text: created.text,
    ts: created.createdAt.toISOString(),
  });
}

export async function editMessageAction(fd: FormData): Promise<void> {
  const session = await auth();
  const me = requireUserId(session);
  const messageId = toStr(fd.get('messageId')).trim();
  const text = toStr(fd.get('text')).trim();
  if (!messageId || !text) return;

  const m = await prisma.message.findFirst({
    where: { id: messageId, authorId: me },
    select: { id: true, threadId: true },
  });
  if (!m) return;

  await prisma.message.update({ where: { id: m.id }, data: { text, editedAt: now() } });
  broker.publish(await participantsOf(m.threadId), {
    type: 'messageEdited',
    threadId: m.threadId,
    at: Date.now(),
    messageId: m.id,
    byId: me,
    text,
  });
}

export async function deleteMessageAction(fd: FormData): Promise<void> {
  const session = await auth();
  const me = requireUserId(session);
  const messageId = toStr(fd.get('messageId')).trim();
  const scope = toStr(fd.get('scope')).trim(); // 'self' | 'both'
  if (!messageId || !scope) return;

  const m = await prisma.message.findFirst({
    where: { id: messageId },
    select: { id: true, threadId: true, authorId: true },
  });
  if (!m) return;

  if (scope === 'self') {
    await prisma.messageHide.upsert({
      where: { messageId_userId: { messageId: m.id, userId: me } },
      update: {},
      create: { messageId: m.id, userId: me },
    });
  } else if (scope === 'both' && m.authorId === me) {
    await prisma.message.update({ where: { id: m.id }, data: { text: '', deletedAt: now() } });
  } else {
    return;
  }

  broker.publish(await participantsOf(m.threadId), {
    type: 'messageDeleted',
    threadId: m.threadId,
    at: Date.now(),
    messageId: m.id,
    byId: me,
    scope: scope as 'self' | 'both',
  });
}

export async function markReadAction(fd: FormData): Promise<void> {
  const session = await auth();
  const me = requireUserId(session);
  const threadId = toStr(fd.get('threadId')).trim();
  if (!threadId) return;

  const th = await prisma.thread.findFirst({
    where: { id: threadId, OR: [{ aId: me }, { bId: me }] },
    select: { aId: true, bId: true },
  });
  if (!th) return;

  await prisma.readMark.upsert({
    where: { threadId_userId: { threadId, userId: me } },
    update: { readAt: now() },
    create: { threadId, userId: me, readAt: now() },
  });

  broker.publish([th.aId, th.bId], { type: 'read', threadId, at: Date.now() });
}

export async function deleteThreadAction(fd: FormData): Promise<void> {
  const session = await auth();
  const me = requireUserId(session);
  const threadId = toStr(fd.get('threadId')).trim();
  if (!threadId) return;

  // проверяем доступ и участников
  const th = await prisma.thread.findFirst({
    where: { id: threadId, OR: [{ aId: me }, { bId: me }] },
    select: { id: true, aId: true, bId: true },
  });
  if (!th) return;

  // каскадное удаление зависимостей + удаление треда
  await prisma.$transaction(async (tx) => {
    const mids = await tx.message.findMany({
      where: { threadId },
      select: { id: true },
    });
    const ids = mids.map(m => m.id);

    if (ids.length) {
      await tx.messageHide.deleteMany({ where: { messageId: { in: ids } } });
    }
    await tx.readMark.deleteMany({ where: { threadId } });
    await tx.message.deleteMany({ where: { threadId } });
    await tx.thread.delete({ where: { id: threadId } });
  });

  const byName = (session?.user as any)?.name || 'Пользователь';

  // уведомляем обоих
  broker.publish([th.aId, th.bId], {
    type: 'threadDeleted',
    threadId,
    at: Date.now(),
    byId: me,
    byName,
  });

  // инициатору — сразу на список, чтобы не рендерить удалённый тред
  redirect('/chat');
}

// app/(app)/chat/actions.ts
'use server';

import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import broker from './sse/broker';
import { redirect } from 'next/navigation';

const toStr = (v: unknown) => (typeof v === 'string' ? v : '');
const now = () => new Date();

function requireSessionId(session: any): string {
  const id = session?.user?.id;
  if (typeof id !== 'string' || !id) redirect('/sign-in');
  return id;
}

export async function sendMessageAction(formData: FormData): Promise<void> {
  const session = await auth();
  const me = requireSessionId(session);

  const threadId = toStr(formData.get('threadId'));
  const text = toStr(formData.get('text')).trim();
  if (!threadId || !text) return;

  const th = await prisma.thread.findFirst({
    where: { id: threadId, OR: [{ aId: me }, { bId: me }] },
    select: { aId: true, bId: true },
  });
  if (!th) return;

  await prisma.$transaction(async (tx) => {
    await tx.message.create({ data: { authorId: me, threadId, text } });
    await tx.thread.update({
      where: { id: threadId },
      data: { lastMessageAt: now(), lastMessageText: text },
    });
    await tx.readMark.upsert({
      where: { threadId_userId: { threadId, userId: me } },
      update: { readAt: now() },
      create: { threadId, userId: me, readAt: now() },
    });
  });

  broker.publish([th.aId, th.bId], { type: 'message', threadId, at: Date.now(), authorId: me });
}

export async function editMessageAction(fd: FormData): Promise<void> {
  const session = await auth();
  const me = requireSessionId(session);
  const messageId = toStr(fd.get('messageId'));
  const newText = toStr(fd.get('text')).trim();
  if (!messageId || !newText) return;

  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, threadId: true, authorId: true, thread: { select: { aId: true, bId: true } } },
  });
  if (!msg || msg.authorId !== me) return;

  await prisma.$transaction(async (tx) => {
    await tx.message.update({ where: { id: messageId }, data: { text: newText, editedAt: now() } });
    await tx.thread.update({ where: { id: msg.threadId }, data: { lastMessageAt: now(), lastMessageText: newText } });
  });

  broker.publish([msg.thread.aId, msg.thread.bId], {
    type: 'messageEdited',
    threadId: msg.threadId,
    at: Date.now(),
    messageId,
    by: me,
  });
}

export async function deleteMessageAction(fd: FormData): Promise<void> {
  const session = await auth();
  const me = requireSessionId(session);
  const messageId = toStr(fd.get('messageId'));
  const scope = toStr(fd.get('scope')) === 'both' ? 'both' : 'self';
  if (!messageId) return;

  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, text: true, authorId: true, threadId: true, thread: { select: { aId: true, bId: true } } },
  });
  if (!msg) return;

  const isParticipant = msg.thread.aId === me || msg.thread.bId === me;
  if (!isParticipant) return;
  const canDeleteForBoth = msg.authorId === me;

  await prisma.$transaction(async (tx) => {
    if (scope === 'self') {
      await tx.messageHide.upsert({
        where: { messageId_userId: { messageId, userId: me } },
        update: {},
        create: { messageId, userId: me },
      });
    } else {
      if (!canDeleteForBoth) return;
      await tx.message.update({ where: { id: messageId }, data: { text: '', deletedAt: now() } });
    }
  });

  broker.publish([msg.thread.aId, msg.thread.bId], {
    type: 'messageDeleted',
    threadId: msg.threadId,
    at: Date.now(),
    messageId,
    by: me,
    scope: scope as 'self' | 'both',
  });
}

export async function deleteThreadAction(formData: FormData): Promise<void> {
  const session = await auth();
  const me = requireSessionId(session);

  const threadId = toStr(formData.get('threadId'));
  if (!threadId) return redirect('/chat');

  const th = await prisma.thread.findFirst({
    where: { id: threadId, OR: [{ aId: me }, { bId: me }] },
    select: { aId: true, bId: true },
  });
  if (!th) return redirect('/chat');

  await prisma.$transaction(async (tx) => {
    const ids = await tx.message.findMany({ where: { threadId }, select: { id: true } });
    await tx.messageHide.deleteMany({ where: { messageId: { in: ids.map((i) => i.id) } } });
    await tx.attachment.deleteMany({ where: { messageId: { in: ids.map((i) => i.id) } } }); // если таблица осталась
    await tx.message.deleteMany({ where: { threadId } });
    await tx.readMark.deleteMany({ where: { threadId } });
    await tx.thread.delete({ where: { id: threadId } });
  });

  broker.publish([th.aId, th.bId], { type: 'threadDeleted', threadId, at: Date.now() });
  redirect('/chat');
}

export async function markReadAction(formData: FormData): Promise<void> {
  const session = await auth();
  const me = requireSessionId(session);
  const threadId = toStr(formData.get('threadId'));
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

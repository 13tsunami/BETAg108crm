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

/**
 * Отправка сообщения + вложений (до 10 МБ/файл), апдейт lastMessage, отметка прочтения отправителя.
 * Без redirect, обновление придёт через SSE.
 */
export async function sendMessageAction(formData: FormData): Promise<void> {
  const session = await auth();
  const me = requireSessionId(session);

  const threadId = toStr(formData.get('threadId'));
  const text = toStr(formData.get('text')).trim();
  if (!threadId) return;

  const th = await prisma.thread.findFirst({
    where: { id: threadId, OR: [{ aId: me }, { bId: me }] },
    select: { aId: true, bId: true },
  });
  if (!th) return;

  // Подготовим файлы (без падения типов в DOM/Node)
  const files = (formData.getAll('files') as any[]).filter(Boolean);
  const blobs: { name: string; mime: string; size: number; data: Buffer }[] = [];
  for (const f of files) {
    // проверяем по «утиным» признакам, чтобы TS не ругался
    if (f && typeof f.arrayBuffer === 'function' && typeof f.size === 'number') {
      if (f.size <= 10 * 1024 * 1024) {
        const buf = Buffer.from(await f.arrayBuffer());
        blobs.push({
          name: typeof f.name === 'string' && f.name ? f.name : 'file',
          mime: typeof f.type === 'string' && f.type ? f.type : 'application/octet-stream',
          size: f.size,
          data: buf,
        });
      }
    }
  }

  if (!text && blobs.length === 0) return;

  // Схлопываем в одну транзакцию
  await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: { authorId: me, threadId, text: text || '' },
      select: { id: true },
    });

    if (blobs.length) {
      await tx.attachment.createMany({
        data: blobs.map((b) => ({
          messageId: msg.id,
          name: b.name,
          mime: b.mime,
          size: b.size,
          data: b.data,
        })),
      });
    }

    await tx.thread.update({
      where: { id: threadId },
      data: { lastMessageAt: now(), lastMessageText: text || (blobs[0]?.name ?? 'вложение') },
    });

    await tx.readMark.upsert({
      where: { threadId_userId: { threadId, userId: me } },
      update: { readAt: now() },
      create: { threadId, userId: me, readAt: now() },
    });
  });

  // Событие — обеим сторонам; authorId опционален, но полезен для клиента
  broker.publish([th.aId, th.bId], { type: 'message', threadId, at: Date.now(), authorId: me });
}

/** Удаление диалога целиком (сообщения, вложения, отметки) + событие + redirect обратно в список */
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
    await tx.attachment.deleteMany({ where: { messageId: { in: ids.map((i) => i.id) } } });
    await tx.message.deleteMany({ where: { threadId } });
    await tx.readMark.deleteMany({ where: { threadId } });
    await tx.thread.delete({ where: { id: threadId } });
  });

  broker.publish([th.aId, th.bId], { type: 'threadDeleted', threadId, at: Date.now() });
  redirect('/chat');
}

/** Пометить диалог прочитанным (для меня) и уведомить собеседника */
export async function markReadAction(formData: FormData): Promise<void> {
  const session = await auth();
  const me = requireSessionId(session);

  const threadId = toStr(formData.get('threadId'));
  if (!threadId) return;

  const ok = await prisma.thread.count({ where: { id: threadId, OR: [{ aId: me }, { bId: me }] } });
  if (!ok) return;

  await prisma.readMark.upsert({
    where: { threadId_userId: { threadId, userId: me } },
    update: { readAt: now() },
    create: { threadId, userId: me, readAt: now() },
  });

  const th = await prisma.thread.findUnique({ where: { id: threadId }, select: { aId: true, bId: true } });
  if (th) broker.publish([th.aId, th.bId], { type: 'read', threadId, at: Date.now() });
}

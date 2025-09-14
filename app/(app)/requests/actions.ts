'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { canCreateRequests, canProcessRequests, normalizeRole } from '@/lib/roles';

function asNonEmpty(v: unknown, field: string, max = 500): string {
  const s = String(v ?? '').trim();
  if (!s) throw new Error(`Поле "${field}" обязательно`);
  if (s.length > max) throw new Error(`Поле "${field}" слишком длинное`);
  return s;
}

function asOptional(v: unknown, max = 1000): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (s.length > max) throw new Error('Слишком длинный текст');
  return s;
}

export async function createRequestAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const role = normalizeRole(session.user.role);
  if (!canCreateRequests(role)) redirect('/');

  const target = asNonEmpty(formData.get('target'), 'Адресат', 64);
  const title = asNonEmpty(formData.get('title'), 'Заголовок', 256);
  const body  = asNonEmpty(formData.get('body'), 'Описание', 4000);

  const req = await prisma.$transaction(async (tx) => {
    const counter = await tx.requestCounter.upsert({
      where: { target },
      create: { target, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    const created = await tx.request.create({
      data: {
        authorId: session.user.id,
        target,
        title,
        body,
        // lastNumber уже либо 1 (create), либо инкрементирован (update)
        targetNumber: counter.lastNumber,
        // status и lastMessageAt по умолчанию
      },
      select: { id: true },
    });
    await tx.requestMessage.create({
      data: {
        requestId: created.id,
        authorId: session.user.id,
        body,
      },
    });
    return created;
  });

  revalidatePath('/requests');
  redirect(`/requests/${req.id}`);
}

export async function replyRequestAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const requestId = asNonEmpty(formData.get('requestId'), 'ID заявки', 64);
  const body = asNonEmpty(formData.get('body'), 'Сообщение', 4000);

  await prisma.$transaction(async (tx) => {
    await tx.requestMessage.create({
      data: {
        requestId,
        authorId: session.user.id,
        body,
      },
    });
    await tx.request.update({
      where: { id: requestId },
      data: { lastMessageAt: new Date() },
    });
  });

  revalidatePath('/requests');
  revalidatePath(`/requests/${requestId}`);
}

export async function takeRequestAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const role = normalizeRole(session.user.role);
  if (!canProcessRequests(role)) redirect('/');

  const requestId = asNonEmpty(formData.get('requestId'), 'ID заявки', 64);

  await prisma.request.update({
    where: { id: requestId },
    data: {
      status: 'in_progress',
      processedById: session.user.id,
    },
  });

  revalidatePath('/requests');
  revalidatePath(`/requests/${requestId}`);
}

export async function closeRequestAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const role = normalizeRole(session.user.role);
  if (!canProcessRequests(role)) redirect('/');

  const requestId = asNonEmpty(formData.get('requestId'), 'ID заявки', 64);
  const action = asNonEmpty(formData.get('action'), 'Действие', 16); // 'done' | 'rejected'
  const reason = asOptional(formData.get('reason'), 1000);

  const status = action === 'done' ? 'done' : action === 'rejected' ? 'rejected' : null;
  if (!status) throw new Error('Некорректное действие');

  await prisma.request.update({
    where: { id: requestId },
    data: {
      status,
      processedById: session.user.id,
      closedAt: new Date(),
      rejectedReason: status === 'rejected' ? reason : null,
    },
  });

  revalidatePath('/requests');
  revalidatePath(`/requests/${requestId}`);
}

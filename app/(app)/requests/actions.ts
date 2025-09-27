// app/(app)/requests/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth.config';
import { revalidatePath } from 'next/cache';

export async function createRequestAction(fd: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const target = String(fd.get('target') || '').trim();
  const title  = String(fd.get('title')  || '').trim();
  const body   = String(fd.get('body')   || '').trim();

  if (!target || !title || !body) redirect('/requests');

  const req = await prisma.request.create({
    data: {
      authorId: session.user.id,
      target,
      status: 'new',
      title,
      body,
      lastMessageAt: new Date(),
    },
  });

  revalidatePath('/requests');
  redirect(`/requests/${req.id}`);
}

export async function replyRequestAction(fd: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const requestId = String(fd.get('requestId') || '');
  const text = String(fd.get('text') || '').trim();
  if (!requestId || !text) redirect('/requests');

  await prisma.requestMessage.create({
    data: { requestId, authorId: session.user.id, body: text },
  });

  await prisma.request.update({
    where: { id: requestId },
    data: { lastMessageAt: new Date(), updatedAt: new Date(), status: 'in_progress' },
  });

  revalidatePath(`/requests/${requestId}`);
  redirect(`/requests/${requestId}`);
}

export async function deleteRequestAction(fd: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const requestId = String(fd.get('requestId') || '');
  if (!requestId) redirect('/requests');

  const req = await prisma.request.findUnique({ where: { id: requestId } });
  if (!req) redirect('/requests');

  const isOwner = req.authorId === session.user.id;
  const isAdmin = session.user.role === 'sysadmin' || session.user.role === 'deputy_axh';
  if (!isOwner && !isAdmin) redirect(`/requests/${requestId}`);

  await prisma.request.delete({ where: { id: requestId } });
  revalidatePath('/requests');
  redirect('/requests');
}

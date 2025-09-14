'use server';

import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateRequests, canProcessRequests } from '@/lib/roles';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createRequestAction(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error('Нет доступа');
  const role = normalizeRole(session.user.role);
  if (!canCreateRequests(role)) throw new Error('Нет доступа');
  const target = String(formData.get('target') || '');
  const title = String(formData.get('title') || '');
  const body = String(formData.get('body') || '');
  const req = await prisma.request.create({
    data: {
      authorId: session.user.id,
      target,
      title,
      body,
      status: 'new',
      messages: { create: { authorId: session.user.id, body } }
    }
  });
  revalidatePath('/requests');
  redirect(`/requests/${req.id}`);
}

export async function replyRequestAction(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error('Нет доступа');
  const requestId = String(formData.get('requestId'));
  const body = String(formData.get('body') || '');
  await prisma.requestMessage.create({
    data: { requestId, authorId: session.user.id, body }
  });
  await prisma.request.update({ where:{id:requestId}, data:{ lastMessageAt:new Date() }});
  revalidatePath(`/requests/${requestId}`);
}

export async function closeRequestAction(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error('Нет доступа');
  const role = normalizeRole(session.user.role);
  if (!canProcessRequests(role)) throw new Error('Нет доступа');
  const requestId = String(formData.get('requestId'));
  const action = String(formData.get('action'));
  const reason = String(formData.get('reason')||'');
  if (action === 'done') {
    await prisma.request.update({
      where:{id:requestId},
      data:{ status:'done', closedAt:new Date(), processedById:session.user.id }
    });
  } else if (action === 'rejected') {
    if (!reason) throw new Error('Укажите причину');
    await prisma.request.update({
      where:{id:requestId},
      data:{ status:'rejected', closedAt:new Date(), processedById:session.user.id, rejectedReason:reason }
    });
  }
  revalidatePath('/requests');
  redirect(`/requests/${requestId}`);
}

export async function reopenRequestAction(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error('Нет доступа');
  const requestId = String(formData.get('requestId'));
  const req = await prisma.request.findUnique({ where:{id:requestId}});
  if (!req || req.authorId !== session.user.id) throw new Error('Нет доступа');
  if (req.status !== 'done') throw new Error('Нельзя переоткрыть');
  await prisma.request.update({
    where:{id:requestId},
    data:{ status:'in_progress', closedAt:null }
  });
  revalidatePath('/requests');
  redirect(`/requests/${requestId}`);
}

'use server';

import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, hasFullAccess } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import crypto from 'node:crypto';

/** Type guard: гарантирует, что value не null/undefined. */
function invariant<T>(
  value: T,
  message = 'Forbidden'
): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

/** Читабельный алиас */
const requireNonNull = invariant;

/** Сохранение файлов в Attachment и линковка к Submission */
async function persistAttachments(files: File[], submissionId: string) {
  for (const file of files) {
    const arrayBuf = await file.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

    const att = await prisma.attachment.create({
      data: {
        name: crypto.randomUUID(), // внутреннее имя в сторедже
        originalName: file.name ?? null,
        mime: file.type || 'application/octet-stream',
        size: buf.length,
        data: buf,
        sha256,
        // messageId остаётся null по схеме
      },
      select: { id: true },
    });

    await prisma.submissionAttachment.create({
      data: { submissionId, attachmentId: att.id },
    });
  }
}

/** 1) Исполнитель: «Отправить на проверку» */
export async function submitForReviewAction(formData: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id ?? null;
  invariant(meId, 'Не авторизовано');

  const taskAssigneeId = String(formData.get('taskAssigneeId') ?? '');
  invariant(taskAssigneeId, 'Нет taskAssigneeId');

  const files = (formData.getAll('files') as File[]).filter(Boolean);
  const comment = String(formData.get('comment') ?? '') || null;

  const ta = await prisma.taskAssignee.findUnique({
    where: { id: taskAssigneeId },
    select: {
      id: true,
      userId: true,
      taskId: true,
      status: true,
      task: { select: { reviewRequired: true } },
    },
  });
  invariant(ta, 'Назначение не найдено');
  invariant(ta.userId === meId, 'Нет доступа к назначению');
  invariant(ta.task?.reviewRequired === true, 'Для этой задачи ревью не требуется');

  await prisma.$transaction(async (tx) => {
    const sub = await tx.submission.create({
      data: { taskAssigneeId, comment },
      select: { id: true },
    });

    if (files.length) {
      for (const file of files) {
        const arrayBuf = await file.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

        const att = await tx.attachment.create({
          data: {
            name: crypto.randomUUID(),
            originalName: file.name ?? null,
            mime: file.type || 'application/octet-stream',
            size: buf.length,
            data: buf,
            sha256,
          },
          select: { id: true },
        });

        await tx.submissionAttachment.create({
          data: { submissionId: sub.id, attachmentId: att.id },
        });
      }
    }

    await tx.taskAssignee.update({
      where: { id: taskAssigneeId },
      data: { status: 'submitted', submittedAt: new Date() },
    });
  });

  revalidatePath('/inboxTasks');
  revalidatePath(`/reviews/${ta.taskId}`);
  redirect(`/reviews/${ta.taskId}`);
}

/** 2) Проверяющий: «Принять» одного исполнителя */
export async function approveSubmissionAction(formData: FormData): Promise<void> {
  const session = await auth();
  const me = session?.user ?? null;
  invariant(me?.id, 'Не авторизовано');

  const taskAssigneeId = String(formData.get('taskAssigneeId') ?? '');
  invariant(taskAssigneeId, 'Нет taskAssigneeId');

  const ta = await prisma.taskAssignee.findUnique({
    where: { id: taskAssigneeId },
    select: { id: true, taskId: true },
  });
  invariant(ta, 'Назначение не найдено');

  const task = await prisma.task.findUnique({
    where: { id: ta.taskId },
    select: { createdById: true },
  });
  const role = normalizeRole(me.role);
  invariant(task, 'Задача не найдена');
  invariant(hasFullAccess(role) || task.createdById === me.id, 'Нет права принимать');

  await prisma.taskAssignee.update({
    where: { id: taskAssigneeId },
    data: { status: 'done', reviewedAt: new Date(), reviewedById: me.id },
  });

  revalidatePath(`/reviews/${ta.taskId}`);
  redirect(`/reviews/${ta.taskId}`);
}

/** 3) Проверяющий: «Вернуть» с причиной */
export async function rejectSubmissionAction(formData: FormData): Promise<void> {
  const session = await auth();
  const me = session?.user ?? null;
  invariant(me?.id, 'Не авторизовано');

  const taskAssigneeId = String(formData.get('taskAssigneeId') ?? '');
  invariant(taskAssigneeId, 'Нет taskAssigneeId');

  const reason = String(formData.get('reason') ?? '') || null;

  const ta = await prisma.taskAssignee.findUnique({
    where: { id: taskAssigneeId },
    select: { id: true, taskId: true },
  });
  invariant(ta, 'Назначение не найдено');

  const task = await prisma.task.findUnique({
    where: { id: ta.taskId },
    select: { createdById: true },
  });
  const role = normalizeRole(me.role);
  invariant(task, 'Задача не найдена');
  invariant(hasFullAccess(role) || task.createdById === me.id, 'Нет права возвращать');

  await prisma.$transaction(async (tx) => {
    await tx.submission.create({
      data: { taskAssigneeId, comment: reason },
    });
    await tx.taskAssignee.update({
      where: { id: taskAssigneeId },
      data: { status: 'in_progress', reviewedAt: new Date(), reviewedById: me.id },
    });
  });

  revalidatePath(`/reviews/${ta.taskId}`);
  redirect(`/reviews/${ta.taskId}`);
}

/** 4) Проверяющий: «Принять всех» (массово тех, кто в submitted) */
export async function approveAllInTaskAction(formData: FormData): Promise<void> {
  const session = await auth();
  const me = session?.user ?? null;
  invariant(me?.id, 'Не авторизовано');

  const taskId = String(formData.get('taskId') ?? '');
  invariant(taskId, 'Нет taskId');

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { createdById: true },
  });
  const role = normalizeRole(me.role);
  invariant(task, 'Задача не найдена');
  invariant(hasFullAccess(role) || task.createdById === me.id, 'Нет права принимать всех');

  await prisma.taskAssignee.updateMany({
    where: { taskId, status: 'submitted' },
    data: { status: 'done', reviewedAt: new Date(), reviewedById: me.id },
  });

  revalidatePath(`/reviews/${taskId}`);
  redirect(`/reviews/${taskId}`);
}

// app/(app)/inboxtasks/review-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canViewTasks, hasFullAccess } from '@/lib/roles';
import { saveBufferToUploads } from '@/lib/uploads'; // NEW: пишем файлы на диск

function forbid(): never {
  redirect('/');
}

/** Узко-типовой инвариант без any */
function invariant<T>(value: T, message = 'Forbidden'): asserts value is NonNullable<T> {
  if (value === null || value === undefined) throw new Error(message);
}

/** Сохранение файлов на диск и линковка к Submission (метаданные в БД) */
async function persistAttachments(files: File[], submissionId: string) {
  for (const file of files) {
    const arr = await file.arrayBuffer();
    const buf = Buffer.from(arr);

    // на диск
    const { name, sha256, size } = await saveBufferToUploads(buf, file.name ?? null);

    // только метаданные в БД
    const att = await prisma.attachment.create({
      data: {
        name,                              // имя файла в сторадже
        originalName: file.name ?? null,   // исходное имя
        mime: file.type || 'application/octet-stream',
        size,
        sha256,
        // data:  // больше НЕ сохраняем бинарь в БД
      },
      select: { id: true },
    });

    await prisma.submissionAttachment.create({
      data: { submissionId, attachmentId: att.id },
    });
  }
}

/**
 * Исполнитель: отправить на проверку.
 * — закрываем прежние open-заявки
 * — создаём Submission { open: true, comment? } + attachments
 * — назначение -> submitted
 */
export async function submitForReviewAction(formData: FormData): Promise<void> {
  const session = await auth();
  const role = normalizeRole(session?.user?.role);
  const meId = session?.user?.id ?? null;
  if (!meId || !canViewTasks(role)) forbid();

  const explicitAssigneeId = (formData.get('taskAssigneeId') ?? '').toString().trim();
  const taskIdRaw = (formData.get('taskId') ?? '').toString().trim();
  const comment = ((formData.get('comment') ?? '') as string).trim() || null;
  const files = (formData.getAll('files') as File[]).filter(Boolean);

  // либо taskAssigneeId, либо taskId+meId
  let taskAssigneeId = explicitAssigneeId;
  if (!taskAssigneeId) {
    invariant(taskIdRaw, 'Нет taskId');
    const ta = await prisma.taskAssignee.findFirst({
      where: { taskId: taskIdRaw, userId: meId },
      select: { id: true, userId: true, task: { select: { reviewRequired: true } }, status: true },
    });
    invariant(ta, 'Назначение не найдено');
    invariant(ta.userId === meId, 'Нет доступа к назначению');
    invariant(ta.task?.reviewRequired === true, 'Для этой задачи ревью не требуется');
    taskAssigneeId = ta.id;
  } else {
    const ta = await prisma.taskAssignee.findUnique({
      where: { id: taskAssigneeId },
      select: { id: true, userId: true, task: { select: { reviewRequired: true, id: true } }, status: true },
    });
    invariant(ta, 'Назначение не найдено');
    invariant(ta.userId === meId, 'Нет доступа к назначению');
    invariant(ta.task?.reviewRequired === true, 'Для этой задачи ревью не требуется');
  }

  await prisma.$transaction(async (tx) => {
    // Закрываем все ранее открытые заявки
    await tx.submission.updateMany({
      where: { taskAssigneeId, open: true },
      data: { open: false },
    });

    // Создаём новую открытую заявку
    const sub = await tx.submission.create({
      data: { taskAssigneeId, comment, open: true },
      select: { id: true },
    });

    // Вложения: пишем на диск, в БД — только метаданные
    if (files.length) {
      for (const file of files) {
        const arr = await file.arrayBuffer();
        const buf = Buffer.from(arr);

        const { name, sha256, size } = await saveBufferToUploads(buf, file.name ?? null);

        const att = await tx.attachment.create({
          data: {
            name,
            originalName: file.name ?? null,
            mime: file.type || 'application/octet-stream',
            size,
            sha256,
          },
          select: { id: true },
        });

        await tx.submissionAttachment.create({
          data: { submissionId: sub.id, attachmentId: att.id },
        });
      }
    }

    // Обновляем статус назначенного
    await tx.taskAssignee.update({
      where: { id: taskAssigneeId },
      data: { status: 'submitted', submittedAt: new Date() },
    });
  });

  revalidatePath('/inboxtasks');
  redirect('/inboxtasks');
}

/**
 * Проверяющий: принять работу.
 * — закрываем open-заявки (reviewedAt/by/comment)
 * — назначение -> done (+completedAt)
 * — доступ: hasFullAccess() или автор задачи
 */
export async function approveSubmissionAction(formData: FormData): Promise<void> {
  const session = await auth();
  const reviewerId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);
  if (!reviewerId) forbid();

  const taskAssigneeId = (formData.get('taskAssigneeId') ?? '').toString().trim();
  const comment = ((formData.get('comment') ?? '') as string).trim() || null;
  if (!taskAssigneeId) forbid();

  const ta = await prisma.taskAssignee.findUnique({
    where: { id: taskAssigneeId },
    select: { id: true, taskId: true },
  });
  invariant(ta, 'Назначение не найдено');

  const task = await prisma.task.findUnique({
    where: { id: ta.taskId },
    select: { createdById: true },
  });
  invariant(task, 'Задача не найдена');
  if (!hasFullAccess(role) && task.createdById !== reviewerId) forbid();

  await prisma.$transaction(async (tx) => {
    await tx.submission.updateMany({
      where: { taskAssigneeId, open: true },
      data: {
        open: false,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
        reviewerComment: comment,
      },
    });
    await tx.taskAssignee.update({
      where: { id: taskAssigneeId },
      data: {
        status: 'done',
        reviewedAt: new Date(),
        reviewedById: reviewerId,
        completedAt: new Date(),
      },
    });
  });

  revalidatePath('/reviews');
  redirect('/reviews');
}

/**
 * Проверяющий: вернуть работу.
 * — закрываем open-заявки с причиной
 * — назначение -> in_progress
 * — доступ: hasFullAccess() или автор задачи
 */
export async function rejectSubmissionAction(formData: FormData): Promise<void> {
  const session = await auth();
  const reviewerId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);
  if (!reviewerId) forbid();

  const taskAssigneeId = (formData.get('taskAssigneeId') ?? '').toString().trim();
  const reason = ((formData.get('reason') ?? '') as string).trim() || null;
  if (!taskAssigneeId) forbid();

  const ta = await prisma.taskAssignee.findUnique({
    where: { id: taskAssigneeId },
    select: { id: true, taskId: true },
  });
  invariant(ta, 'Назначение не найдено');

  const task = await prisma.task.findUnique({
    where: { id: ta.taskId },
    select: { createdById: true },
  });
  invariant(task, 'Задача не найдена');
  if (!hasFullAccess(role) && task.createdById !== reviewerId) forbid();

  await prisma.$transaction(async (tx) => {
    await tx.submission.updateMany({
      where: { taskAssigneeId, open: true },
      data: {
        open: false,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
        reviewerComment: reason,
      },
    });
    await tx.taskAssignee.update({
      where: { id: taskAssigneeId },
      data: {
        status: 'in_progress',
        reviewedAt: new Date(),
        reviewedById: reviewerId,
      },
    });
  });

  revalidatePath('/reviews');
  redirect('/reviews');
}

/**
 * Проверяющий: принять всех в задаче.
 * — для всех submitted закрываем open-заявки и ставим done
 * — доступ: hasFullAccess() или автор задачи
 */
export async function approveAllInTaskAction(formData: FormData): Promise<void> {
  const session = await auth();
  const reviewerId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);
  if (!reviewerId) forbid();

  const taskId = (formData.get('taskId') ?? '').toString().trim();
  if (!taskId) forbid();

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { createdById: true },
  });
  invariant(task, 'Задача не найдена');
  if (!hasFullAccess(role) && task.createdById !== reviewerId) forbid();

  await prisma.$transaction(async (tx) => {
    const assignees = await tx.taskAssignee.findMany({
      where: { taskId, status: 'submitted' },
      select: { id: true },
    });
    if (assignees.length === 0) return;

    const ids = assignees.map(a => a.id);

    await tx.submission.updateMany({
      where: { taskAssigneeId: { in: ids }, open: true },
      data: {
        open: false,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
      },
    });

    await tx.taskAssignee.updateMany({
      where: { id: { in: ids } },
      data: {
        status: 'done',
        reviewedAt: new Date(),
        reviewedById: reviewerId,
        completedAt: new Date(),
      },
    });
  });

  revalidatePath('/reviews');
  redirect('/reviews');
}

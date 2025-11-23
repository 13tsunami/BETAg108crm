'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks } from '@/lib/roles';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';

type Priority = 'normal' | 'high';

/*
  Универсальный redirect назад, без автодобавления модалок.
  Никаких modal=search-by-me больше не подставляем.
*/
async function redirectBackWith(
  params: Record<string, string | number | undefined>,
  fallback: string = '/inboxtasks?tab=byme'
) {
  const h = await headers();
  const ref = h.get('referer') || fallback;

  let url = fallback;

  try {
    const u = new URL(ref, 'http://local');
    const q = new URLSearchParams(u.search);

    for (const k of ['error', 'notice', 'purged']) q.delete(k);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      q.set(k, String(v));
    }

    url = u.pathname + (q.toString() ? `?${q}` : '');
  } catch {
    // оставляем fallback
  }

  redirect(url);
}

function asNonEmptyString(v: unknown, field: string, max = 256): string {
  const s = String(v ?? '').trim();
  if (!s) throw new Error(`Поле "${field}" обязательно`);
  if (s.length > max) throw new Error(`Поле "${field}" слишком длинное`);
  return s;
}

function asOptionalString(v: unknown, max = 10000): string | null {
  if (v == null) return null;
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (s.length > max) throw new Error('Текст слишком длинный');
  return s;
}

function asPriority(v: unknown): Priority {
  const s = String(v ?? '').trim();
  return s === 'high' ? 'high' : 'normal';
}

function parseISODate(v: unknown): Date {
  const s = String(v ?? '').trim();
  if (!s) throw new Error('Не задан срок задачи');
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error('Некорректный формат даты');
  return d;
}

function parseAssigneeIds(json: unknown): string[] {
  try {
    const arr = JSON.parse(String(json ?? '[]'));
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => String(x)).filter(Boolean);
  } catch {
    return [];
  }
}

async function nextTaskNumber() {
  const last = await prisma.task.findFirst({
    select: { number: true },
    orderBy: { number: 'desc' },
  });
  return (last?.number ?? 0) + 1;
}

const FILES_DIR = process.env.FILES_DIR ?? process.env.UPLOADS_DIR ?? '/uploads';
const MAX_MB = Number(process.env.MAX_UPLOAD_MB || '50');
const MAX_BYTES = MAX_MB * 1024 * 1024;

async function ensureFilesDir() {
  await mkdir(FILES_DIR, { recursive: true });
}

async function saveOneFile(tx: Prisma.TransactionClient, taskId: string, file: File) {
  try {
    if (!file) return;
    if (typeof file.size === 'number' && file.size > MAX_BYTES) {
      console.warn('[upload] file too large, skipped', {
        name: file.name,
        size: file.size,
        max: MAX_BYTES,
      });
      return;
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name || '') || '';
    const newName = `${crypto.randomUUID()}${ext}`;
    const full = path.join(FILES_DIR, newName);

    await writeFile(full, buf);

    const att = await tx.attachment.create({
      data: {
        name: newName,
        originalName: file.name || null,
        size: buf.length,
        mime: file.type || 'application/octet-stream',
      },
    });

    await tx.taskAttachment.create({
      data: { taskId, attachmentId: att.id },
    });
  } catch (err) {
    console.error('[upload] failed', err);
  }
}

export async function createTaskAction(fd: FormData): Promise<void> {
  try {
    const session = await auth();
    const meId = session?.user?.id ?? null;
    const role = normalizeRole(session?.user?.role);
    if (!meId || !canCreateTasks(role)) return;

    const title = asNonEmptyString(fd.get('title'), 'Название');
    const description = asOptionalString(fd.get('description')) ?? '';
    const dueDate = parseISODate(fd.get('due'));
    const priority = asPriority(fd.get('priority'));
    const reviewRequired = String(fd.get('reviewRequired') ?? '') === '1';
    const userIds = parseAssigneeIds(fd.get('assigneeUserIdsJson'));

    if (userIds.length === 0) throw new Error('Нужно выбрать хотя бы одного исполнителя');

    let uploadsReady = true;
    try {
      await ensureFilesDir();
    } catch {
      uploadsReady = false;
    }

    await prisma.$transaction(async (tx) => {
      const number = await nextTaskNumber();

      const task = await tx.task.create({
        data: {
          number,
          title,
          description,
          dueDate,
          priority,
          hidden: false,
          reviewRequired,
          createdById: meId,
          createdByName: session?.user?.name ?? null,
          assignees: {
            create: userIds.map((uid) => ({
              userId: uid,
              status: 'in_progress',
              assignedAt: new Date(),
            })),
          },
        },
        select: { id: true },
      });

      if (uploadsReady) {
        const files = fd.getAll('taskFiles') as unknown as File[];
        for (const f of files) await saveOneFile(tx, task.id, f);
      }
    });

    revalidatePath('/inboxtasks');
    redirect('/inboxtasks?tab=byme');
  } catch (err) {
    console.error('[createTaskAction] failed', err);
  }
}

export async function updateTaskAction(fd: FormData): Promise<void> {
  try {
    const session = await auth();
    const meId = session?.user?.id ?? null;
    const role = normalizeRole(session?.user?.role);
    if (!meId || !canCreateTasks(role)) return;

    const taskId = String(fd.get('taskId') ?? '').trim();
    if (!taskId) throw new Error('taskId is required');

    const title = asNonEmptyString(fd.get('title'), 'Название');
    const description = asOptionalString(fd.get('description')) ?? undefined;
    const dueRaw = fd.get('dueDate');
    const dueDate = dueRaw ? parseISODate(dueRaw) : undefined;
    const priority = asPriority(fd.get('priority'));

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, createdById: true },
    });
    if (!task) throw new Error('Задача не найдена');
    if (task.createdById !== meId && !canCreateTasks(role)) return;

    await prisma.task.update({
      where: { id: taskId },
      data: {
        title,
        description,
        priority,
        ...(dueDate ? { dueDate } : {}),
      },
    });

    revalidatePath('/inboxtasks');
  } catch (err) {
    console.error('[updateTaskAction] failed', err);
  }
}

export async function deleteTaskAction(fd: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);

  const returnTo = String(fd.get('returnTo') ?? '') || undefined;

  if (!meId || !canCreateTasks(role)) {
    await redirectBackWith({ error: 'Недостаточно прав' }, returnTo);
    return;
  }

  const taskId = String(fd.get('taskId') ?? '').trim();
  if (!taskId) {
    await redirectBackWith({ error: 'taskId is required' }, returnTo);
    return;
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, createdById: true },
  });
  if (!task) {
    await redirectBackWith({ notice: 'Задача уже удалена' }, returnTo);
    return;
  }
  if (task.createdById !== meId && !canCreateTasks(role)) {
    await redirectBackWith({ error: 'Недостаточно прав' }, returnTo);
    return;
  }

  await prisma.task.delete({ where: { id: taskId } });

  revalidatePath('/inboxtasks');
  revalidatePath('/dashboard');

  await redirectBackWith({ notice: 'Задача удалена' }, returnTo);
}

export async function purgeHiddenTasksAction(fd?: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);

  const returnTo = fd ? (String(fd.get('returnTo') ?? '') || undefined) : undefined;

  if (!meId || role !== 'deputy_plus') {
    await redirectBackWith({ error: 'Недостаточно прав' }, returnTo);
    return;
  }

  const { count } = await prisma.task.deleteMany({
    where: { createdById: meId, hidden: true },
  });

  revalidatePath('/inboxtasks');
  revalidatePath('/dashboard');

  await redirectBackWith({ purged: count }, returnTo);
}

export async function markAssigneeDoneAction(fd: FormData): Promise<void> {
  try {
    const session = await auth();
    const meId = session?.user?.id ?? null;
    if (!meId) return;

    const taskId = String(fd.get('taskId') ?? '').trim();
    if (!taskId) throw new Error('taskId is required');

    const assn = await prisma.taskAssignee.findFirst({
      where: { taskId, userId: meId },
      select: { id: true, status: true },
    });
    if (!assn) return;

    if (assn.status !== 'done') {
      await prisma.taskAssignee.update({
        where: { id: assn.id },
        data: { status: 'done', completedAt: new Date() },
      });
    }

    revalidatePath('/inboxtasks');
  } catch (err) {
    console.error('[markAssigneeDoneAction] failed', err);
  }
}

export async function unarchiveAssigneeAction(fd: FormData): Promise<void> {
  try {
    const session = await auth();
    const meId = session?.user?.id ?? null;
    if (!meId) return;

    const assigneeId = String(fd.get('assigneeId') ?? '').trim();
    const taskId = String(fd.get('taskId') ?? '').trim();
    if (!assigneeId || !taskId) return;

    const assn = await prisma.taskAssignee.findUnique({
      where: { id: assigneeId },
      select: { id: true, userId: true },
    });
    if (!assn || assn.userId !== meId) return;

    await prisma.taskAssignee.update({
      where: { id: assn.id },
      data: { status: 'in_progress', completedAt: null },
    });

    revalidatePath('/inboxtasks');
  } catch (err) {
    console.error('[unarchiveAssigneeAction] failed', err);
  }
}

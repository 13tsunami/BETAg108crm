// app/(app)/inboxtasks/actions.ts
'use server';

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

function asNonEmptyString(v: unknown, field: string, max = 256): string {
  const s = String(v ?? '').trim();
  if (!s) throw new Error(`Поле "${field}" обязательно`);
  if (s.length > max) throw new Error(`Поле "${field}" слишком длинное`);
  return s;
}
function asOptionalString(v: unknown, max = 10_000): string | null {
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
    return arr.map(x => String(x)).filter(Boolean);
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

/** Каталог хранения файлов:
 *  1) FILES_DIR, если задан,
 *  2) иначе UPLOADS_DIR,
 *  3) иначе /uploads.
 */
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
      console.warn('[upload] file too large, skipped', { name: file.name, size: file.size, max: MAX_BYTES });
      return;
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name || '') || '';
    const name = `${crypto.randomUUID()}${ext}`;
    const full = path.join(FILES_DIR, name);

    await writeFile(full, buf);

    const att = await tx.attachment.create({
      data: {
        name,                               // внутреннее имя (для /api/files/:name)
        originalName: file.name || null,    // имя, как загружал пользователь
        size: buf.length,
        mime: file.type || 'application/octet-stream',
      },
    });

    await tx.taskAttachment.create({
      data: { taskId, attachmentId: att.id },
    });
  } catch (err) {
    console.error('[upload] failed to save file', { err });
    // мягкий режим: не валим экшен целиком
  }
}

export async function createTaskAction(fd: FormData): Promise<void> {
  try {
    const session = await auth();
    const meId = session?.user?.id ?? null;
    const role = normalizeRole(session?.user?.role);
    if (!meId || !canCreateTasks(role)) return;

    const title = asNonEmptyString(fd.get('title'), 'Название');
    const description = asOptionalString(fd.get('description')) ?? ''; // в схеме description: String (не null)
    const dueDate = parseISODate(fd.get('due')); // hidden name="due" из формы TaskForm
    const priority = asPriority(fd.get('priority'));
    const reviewRequired = String(fd.get('reviewRequired') ?? '') === '1';

    const userIds = parseAssigneeIds(fd.get('assigneeUserIdsJson'));
    if (userIds.length === 0) throw new Error('Нужно выбрать хотя бы одного исполнителя');

    // Пытаемся подготовить каталог под файлы, но не рвём сохранение задачи при ошибке
    let uploadsReady = true;
    try {
      await ensureFilesDir();
    } catch (e) {
      uploadsReady = false;
      console.error('[files] ensure dir failed, continue without saving files', e);
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
            create: userIds.map(uid => ({
              userId: uid,
              status: 'in_progress',
              assignedAt: new Date(),
            })),
          },
        },
        select: { id: true },
      });

      // Файлы задачи: name="taskFiles"
      if (uploadsReady) {
        const files = fd.getAll('taskFiles') as unknown as File[];
        if (files && files.length) {
          for (const f of files) {
            await saveOneFile(tx, task.id, f);
          }
        }
      }
    });

    revalidatePath('/inboxtasks');
    redirect('/inboxtasks'); // явный переход после успеха
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
    const description = asOptionalString(fd.get('description')) ?? undefined; // undefined = не трогать поле
    const dueRaw = fd.get('dueDate'); // если форма шлёт dueDate, разбираем его
    const dueDate = dueRaw ? parseISODate(dueRaw) : undefined;
    const priority = asPriority(fd.get('priority'));

    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, createdById: true } });
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
  try {
    const session = await auth();
    const meId = session?.user?.id ?? null;
    const role = normalizeRole(session?.user?.role);
    if (!meId || !canCreateTasks(role)) return;

    const taskId = String(fd.get('taskId') ?? '').trim();
    if (!taskId) throw new Error('taskId is required');

    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, createdById: true } });
    if (!task) return;
    if (task.createdById !== meId && !canCreateTasks(role)) return;

    // мягкое "удаление"
    await prisma.task.update({ where: { id: taskId }, data: { hidden: true } });

    revalidatePath('/inboxtasks');
  } catch (err) {
    console.error('[deleteTaskAction] failed', err);
  }
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

// app/(app)/inboxtasks/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks, hasFullAccess } from '@/lib/roles';
import { saveTaskFileToDiskAndDb } from '@/lib/server/uploads';

// утилита: "сегодня 00:00" в зоне Asia/Yekaterinburg (UTC+5) в UTC
function todayStartUtcFromYekb(): Date {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const utcToday = new Date(Date.UTC(y, m, d));
  const isoY = utcToday.getUTCFullYear();
  const isoM = String(utcToday.getUTCMonth() + 1).padStart(2, '0');
  const isoD = String(utcToday.getUTCDate()).padStart(2, '0');
  const yekbLocalMidnight = new Date(`${isoY}-${isoM}-${isoD}T00:00:00+05:00`);
  return new Date(yekbLocalMidnight.toISOString()); // UTC
}

function uniqueStrings(input: unknown): string[] {
  if (!input) return [];
  let arr: string[] = [];
  if (Array.isArray(input)) {
    arr = input.map(String);
  } else if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as unknown;
      return uniqueStrings(parsed);
    } catch {
      arr = [input];
    }
  } else {
    arr = [String(input)];
  }
  const set = new Set(arr.map(s => s.trim()).filter(Boolean));
  return Array.from(set);
}

function revalidateAll() {
  revalidatePath('/inboxtasks');
  revalidatePath('/inboxtasks/archive');
  revalidatePath('/calendar');
  revalidatePath('/'); // Sidebar (unreadTasks)
  revalidatePath('/reviews');
}

const MAX_TASK_FILES = Number(process.env.NEXT_PUBLIC_MAX_TASK_FILES ?? 12);
const MAX_TASK_FILE_SIZE = Number(process.env.NEXT_PUBLIC_MAX_TASK_FILE_SIZE ?? 50 * 1024 * 1024); // 50MB
const ALLOWED_TASK_FILE_MIME = (process.env.NEXT_PUBLIC_TASK_FILE_MIME_WHITELIST ??
  'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,image/png,image/jpeg,image/jpg,image/gif')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export async function createTaskAction(fd: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id ?? null;
  const meName = session?.user?.name ?? null;
  const role = normalizeRole(session?.user?.role);

  if (!meId || !canCreateTasks(role)) {
    revalidateAll();
    return;
  }

  const title = String(fd.get('title') ?? '').trim();
  const description = String(fd.get('description') ?? '').trim();
  const dueIso = String(fd.get('due') ?? '').trim(); // ISO от формы (Екб -> UTC)
  const priority = (String(fd.get('priority') ?? 'normal') === 'high') ? 'high' : 'normal';
  const noCalendar = String(fd.get('noCalendar') ?? '') === '1';

  // исправлено: поддерживаем 1 | on | true
  const reviewRequiredRaw = String(fd.get('reviewRequired') ?? '').toLowerCase();
  const reviewRequired = reviewRequiredRaw === '1' || reviewRequiredRaw === 'on' || reviewRequiredRaw === 'true';

  const assigneeUserIdsJson = fd.get('assigneeUserIdsJson');
  const assigneeIds = uniqueStrings(assigneeUserIdsJson);

  if (!title || !dueIso) { revalidateAll(); return; }
  const dueDate = new Date(dueIso);
  if (Number.isNaN(dueDate.getTime())) { revalidateAll(); return; }

  const todayStartUtc = todayStartUtcFromYekb();
  if (dueDate.getTime() < todayStartUtc.getTime()) { revalidateAll(); return; }

  // файлы из формы (множественные)
  const taskFiles = (fd.getAll('taskFiles') ?? []).filter((x): x is File => x instanceof File);

  try {
    // создаём задачу
    const task = await prisma.task.create({
      data: {
        title,
        description,
        dueDate,
        priority,
        hidden: !!noCalendar,
        createdById: meId,
        createdByName: meName ?? null,
        reviewRequired,
      },
      select: { id: true },
    });

    // создаём назначения
    if (assigneeIds.length > 0) {
      await prisma.taskAssignee.createMany({
        data: assigneeIds.map((uid) => ({
          taskId: task.id,
          userId: uid,
          status: 'in_progress',
        })),
        skipDuplicates: true,
      });
    }

    // сохраняем вложения задачи (если переданы)
    if (taskFiles.length > 0) {
      const limited = taskFiles.slice(0, MAX_TASK_FILES);
      for (const f of limited) {
        // базовая валидация
        const fsize = (f as File).size ?? 0;
        const fmime = (f as File).type || 'application/octet-stream';

        if (!fsize || fsize > MAX_TASK_FILE_SIZE) continue;
        if (ALLOWED_TASK_FILE_MIME.length && !ALLOWED_TASK_FILE_MIME.includes(fmime)) continue;

        await saveTaskFileToDiskAndDb({ file: f, taskId: task.id });
      }
    }
  } finally {
    revalidateAll();
  }
}

export async function updateTaskAction(fd: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);

  const taskId = String(fd.get('taskId') ?? '').trim();
  if (!meId || !taskId) { revalidateAll(); return; }

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, createdById: true } });
  if (!task) { revalidateAll(); return; }

  const canEdit = task.createdById === meId || hasFullAccess(role);
  if (!canEdit) { revalidateAll(); return; }

  const archive = String(fd.get('archive') ?? '') === '1';

  const title = fd.get('title');
  const description = fd.get('description');
  const priorityRaw = fd.get('priority');
  const hiddenRaw = fd.get('hidden');
  const dueDateRaw = fd.get('dueDate'); // YYYY-MM-DD
  const reviewRequiredRaw = fd.get('reviewRequired');

  const data: {
    title?: string;
    description?: string;
    priority?: string;
    hidden?: boolean;
    dueDate?: Date;
    reviewRequired?: boolean;
  } = {};

  if (title !== null) data.title = String(title ?? '').trim();
  if (description !== null) data.description = String(description ?? '').trim();
  if (priorityRaw !== null) data.priority = (String(priorityRaw) === 'high') ? 'high' : 'normal';
  if (hiddenRaw !== null) data.hidden = String(hiddenRaw ?? '') === 'on';
  if (archive) data.hidden = true;

  if (dueDateRaw !== null) {
    const dateStr = String(dueDateRaw ?? '').trim();
    if (dateStr) {
      const due = new Date(`${dateStr}T23:59:00+05:00`);
      if (!Number.isNaN(due.getTime())) data.dueDate = due;
    }
  }

  if (reviewRequiredRaw !== null) {
    const val = String(reviewRequiredRaw ?? '').toLowerCase();
    data.reviewRequired = val === '1' || val === 'on' || val === 'true';
  }

  try {
    await prisma.task.update({ where: { id: taskId }, data });
  } finally {
    revalidateAll();
  }
}

export async function deleteTaskAction(fd: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);

  const taskId = String(fd.get('taskId') ?? '').trim();
  if (!meId || !taskId) { revalidateAll(); return; }

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, createdById: true } });
  if (!task) { revalidateAll(); return; }

  const canEdit = task.createdById === meId || hasFullAccess(role);
  if (!canEdit) { revalidateAll(); return; }

  try {
    await prisma.task.delete({ where: { id: taskId } }); // каскад удалит TaskAssignee
  } finally {
    revalidateAll();
  }
}

export async function markAssigneeDoneAction(fd: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id ?? null;
  const taskId = String(fd.get('taskId') ?? '').trim();

  if (!meId || !taskId) { revalidateAll(); return; }

  try {
    const t = await prisma.task.findUnique({
      where: { id: taskId },
      select: { reviewRequired: true },
    });
    if (!t) { revalidateAll(); return; }
    if (t.reviewRequired) { revalidateAll(); return; }

    await prisma.taskAssignee.updateMany({
      where: { taskId, userId: meId, status: 'in_progress' },
      data: { status: 'done', completedAt: new Date() },
    });
  } finally {
    revalidateAll();
  }
}

export async function unarchiveAssigneeAction(fd: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id ?? null;

  const assigneeId = String(fd.get('assigneeId') ?? '').trim();
  const taskId = String(fd.get('taskId') ?? '').trim();

  if (!meId) { revalidateAll(); return; }

  try {
    if (assigneeId) {
      const ass = await prisma.taskAssignee.findUnique({
        where: { id: assigneeId },
        select: { id: true, userId: true },
      });
      if (!ass || ass.userId !== meId) {
        revalidateAll();
        return;
      }

      await prisma.taskAssignee.update({
        where: { id: assigneeId },
        data: { status: 'in_progress', completedAt: null },
      });
    } else if (taskId) {
      await prisma.taskAssignee.updateMany({
        where: { taskId, userId: meId, status: 'done' },
        data: { status: 'in_progress', completedAt: null },
      });
    }
  } finally {
    revalidateAll();
  }
}

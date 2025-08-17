// app/inboxtasks/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks, hasFullAccess } from '@/lib/roles';

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

export async function createTaskAction(fd: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id ?? null;
  const meName = session?.user?.name ?? null;
  const role = normalizeRole(session?.user?.role);

  if (!meId || !canCreateTasks(role)) {
    revalidatePath('/inboxtasks');
    revalidatePath('/'); // обновление layout/Sidebar
    return;
  }

  const title = String(fd.get('title') ?? '').trim();
  const description = String(fd.get('description') ?? '').trim();
  const dueIso = String(fd.get('due') ?? '').trim(); // ISO от формы (Екб -> UTC)
  const priority = (String(fd.get('priority') ?? 'normal') === 'high') ? 'high' : 'normal';
  const noCalendar = String(fd.get('noCalendar') ?? '') === '1';
  const assigneeUserIdsJson = fd.get('assigneeUserIdsJson');

  const assigneeIds = uniqueStrings(assigneeUserIdsJson);

  if (!title) {
    revalidatePath('/inboxtasks');
    revalidatePath('/');
    return;
  }
  if (!dueIso) {
    revalidatePath('/inboxtasks');
    revalidatePath('/');
    return;
  }
  const dueDate = new Date(dueIso);
  if (Number.isNaN(dueDate.getTime())) {
    revalidatePath('/inboxtasks');
    revalidatePath('/');
    return;
  }

  const todayStartUtc = todayStartUtcFromYekb();
  if (dueDate.getTime() < todayStartUtc.getTime()) {
    revalidatePath('/inboxtasks');
    revalidatePath('/');
    return;
  }

  try {
    const task = await prisma.task.create({
      data: {
        title,
        description,
        dueDate,
        priority,
        hidden: !!noCalendar,
        createdById: meId,
        createdByName: meName ?? null,
      },
      select: { id: true },
    });

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
  } finally {
    revalidatePath('/inboxtasks');
    revalidatePath('/calendar');
    revalidatePath('/'); // важно: для Sidebar unreadTasks
  }
}

export async function updateTaskAction(fd: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);

  const taskId = String(fd.get('taskId') ?? '').trim();
  if (!meId || !taskId) {
    revalidatePath('/inboxtasks');
    revalidatePath('/');
    return;
  }

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, createdById: true } });
  if (!task) {
    revalidatePath('/inboxtasks');
    revalidatePath('/');
    return;
  }

  const canEdit = task.createdById === meId || hasFullAccess(role);
  if (!canEdit) {
    revalidatePath('/inboxtasks');
    revalidatePath('/');
    return;
  }

  const archive = String(fd.get('archive') ?? '') === '1';

  const title = fd.get('title');
  const description = fd.get('description');
  const priorityRaw = fd.get('priority');
  const hiddenRaw = fd.get('hidden');
  const dueDateRaw = fd.get('dueDate'); // YYYY-MM-DD

  const data: {
    title?: string;
    description?: string;
    priority?: string;
    hidden?: boolean;
    dueDate?: Date;
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
      if (!Number.isNaN(due.getTime())) {
        data.dueDate = due;
      }
    }
  }

  try {
    await prisma.task.update({
      where: { id: taskId },
      data,
    });
  } finally {
    revalidatePath('/inboxtasks');
    revalidatePath('/calendar');
    revalidatePath('/'); // Sidebar
  }
}

export async function deleteTaskAction(fd: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);

  const taskId = String(fd.get('taskId') ?? '').trim();
  if (!meId || !taskId) {
    revalidatePath('/inboxtasks');
    revalidatePath('/');
    return;
  }

  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, createdById: true } });
  if (!task) {
    revalidatePath('/inboxtasks');
    revalidatePath('/');
    return;
  }

  const canEdit = task.createdById === meId || hasFullAccess(role);
  if (!canEdit) {
    revalidatePath('/inboxtasks');
    revalidatePath('/');
    return;
  }

  try {
    await prisma.task.delete({ where: { id: taskId } }); // каскад удалит TaskAssignee
  } finally {
    revalidatePath('/inboxtasks');
    revalidatePath('/calendar');
    revalidatePath('/'); // Sidebar
  }
}

export async function markAssigneeDoneAction(fd: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id ?? null;
  const taskId = String(fd.get('taskId') ?? '').trim();

  if (!meId || !taskId) {
    revalidatePath('/inboxtasks');
    revalidatePath('/');
    return;
  }

  try {
    await prisma.taskAssignee.updateMany({
      where: { taskId, userId: meId, status: 'in_progress' },
      data: { status: 'done', completedAt: new Date() },
    });
  } finally {
    revalidatePath('/inboxtasks');
    revalidatePath('/calendar');
    revalidatePath('/'); // Sidebar
  }
}

// app/inboxTasks/actions.ts
'use server';

import { auth } from '@/auth.config';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

// БАЗОВАЯ ПРОВЕРКА СЕССИИ
async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = (session?.user as any)?.id as string | undefined;
  if (!id) redirect('/sign-in');
  return id;
}

/**
 * CREATE
 * fd: title, description, due (YYYY-MM-DD), priority ("normal"|"high"), noCalendar ("on"|"true"|"1"),
 *     assigneeUserIdsJson (JSON string: string[])
 */
export async function createTaskAction(fd: FormData): Promise<void> {
  await requireUserId();

  const title = String(fd.get('title') ?? '').trim();
  const description = String(fd.get('description') ?? '');
  const due = String(fd.get('due') ?? '');
  const priority = (String(fd.get('priority') ?? 'normal') === 'high') ? 'high' : 'normal';
  const noCalendar = ['on', 'true', '1'].includes(String(fd.get('noCalendar') ?? '').toLowerCase());
  const assigneeUserIdsJson = String(fd.get('assigneeUserIdsJson') ?? '[]');

  if (!title || !due) {
    // мягко — без 500
    revalidatePath('/inboxTasks');
    redirect('/inboxTasks?error=invalid_form');
  }

  let assigneeUserIds: string[] = [];
  try { assigneeUserIds = JSON.parse(assigneeUserIdsJson) as string[]; } catch { assigneeUserIds = []; }

  const payload = {
    title,
    description,
    dueDate: `${due}T00:00:00.000Z`,
    priority,
    hidden: !!noCalendar,
    assigneeUserIds,
  };

  // используем существующий REST, чтобы не гадать по Prisma-схеме
  const r = await fetch(`${process.env.NEXTAUTH_URL || ''}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // важно: абсолютный URL, т.к. action выполняется на сервере
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  // даже при ошибке не роняем 500 — мягкий редирект с сообщением
  revalidatePath('/inboxTasks');
  if (!r.ok) redirect('/inboxTasks?error=create_failed');
  redirect('/inboxTasks?ok=created');
}

/**
 * UPDATE
 * fd: id, title, description, due (YYYY-MM-DD), priority ("normal"|"high"), noCalendar ("on"|"true"|"1")
 */
export async function updateTaskAction(fd: FormData): Promise<void> {
  await requireUserId();

  const id = String(fd.get('id') ?? '').trim();
  const title = String(fd.get('title') ?? '').trim();
  const description = String(fd.get('description') ?? '');
  const due = String(fd.get('due') ?? '');
  const priority = (String(fd.get('priority') ?? 'normal') === 'high') ? 'high' : 'normal';
  const noCalendar = ['on', 'true', '1'].includes(String(fd.get('noCalendar') ?? '').toLowerCase());

  if (!id || !title) {
    revalidatePath('/inboxTasks');
    redirect('/inboxTasks?error=invalid_form');
  }

  const payload = {
    title,
    description,
    dueDate: due ? `${due}T00:00:00.000Z` : null,
    priority,
    hidden: !!noCalendar,
  };

  const r = await fetch(`${process.env.NEXTAUTH_URL || ''}/api/tasks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  revalidatePath('/inboxTasks');
  if (!r.ok) redirect('/inboxTasks?error=update_failed');
  redirect('/inboxTasks?ok=updated');
}

/**
 * DELETE
 * fd: id
 */
export async function deleteTaskAction(fd: FormData): Promise<void> {
  await requireUserId();

  const id = String(fd.get('id') ?? '').trim();
  if (!id) {
    revalidatePath('/inboxTasks');
    redirect('/inboxTasks?error=invalid_id');
  }

  const r = await fetch(`${process.env.NEXTAUTH_URL || ''}/api/tasks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    cache: 'no-store',
  });

  revalidatePath('/inboxTasks');
  if (!r.ok && r.status !== 404 && r.status !== 410) redirect('/inboxTasks?error=delete_failed');
  redirect('/inboxTasks?ok=deleted');
}

/**
 * MARK DONE
 * fd: id
 */
export async function markDoneAction(fd: FormData): Promise<void> {
  const meId = await requireUserId();
  const id = String(fd.get('id') ?? '').trim();
  if (!id) {
    revalidatePath('/inboxTasks');
    redirect('/inboxTasks?error=invalid_id');
  }

  const r = await fetch(`${process.env.NEXTAUTH_URL || ''}/api/tasks/${encodeURIComponent(id)}/assignees/${encodeURIComponent(meId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'done' }),
    cache: 'no-store',
  });

  revalidatePath('/inboxTasks');
  if (!r.ok) redirect('/inboxTasks?error=mark_failed');
  redirect('/inboxTasks?ok=marked');
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';

/** ==== ВСПОМОГАТЕЛЬНОЕ ==== */
function parseBool(v: FormDataEntryValue | null): boolean {
  if (v === null) return false;
  const s = String(v).toLowerCase();
  return s === 'on' || s === 'true' || s === '1';
}

// Преобразуем локальные дата/время (Екатеринбург) в UTC
function toUTCfromYekb(localDate: string, timeHHMM: string | null, allDay: boolean): Date {
  const hhmm = allDay ? '00:00' : (timeHHMM && /^\d{2}:\d{2}$/.test(timeHHMM) ? timeHHMM : '00:00');
  // +05:00 — Asia/Yekaterinburg
  return new Date(`${localDate}T${hhmm}:00+05:00`);
}

/** ==== ЗАМЕТКИ ==== */
export async function createNoteAction(formData: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id;
  if (!meId) redirect('/');

  const date = String(formData.get('date') || '').trim(); // YYYY-MM-DD
  const allDay = parseBool(formData.get('allDay'));
  const time = formData.get('time');                      // HH:MM | null
  const title = (formData.get('title') || '').toString().trim() || null;
  const text = (formData.get('text') || '').toString();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect('/calendar');

  const at = toUTCfromYekb(date, time ? String(time) : null, allDay);

  await prisma.note.create({
    data: { userId: meId, at, allDay, title, text },
  });

  revalidatePath('/calendar');
  redirect('/calendar');
}

export async function updateNoteAction(formData: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id;
  if (!meId) redirect('/');

  const noteId = String(formData.get('noteId') || '');
  const date = String(formData.get('date') || '').trim();
  const allDay = parseBool(formData.get('allDay'));
  const time = formData.get('time'); // HH:MM | null
  const title = (formData.get('title') || '').toString().trim() || null;
  const text = (formData.get('text') || '').toString();

  if (!noteId) redirect('/calendar');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect('/calendar');

  const at = toUTCfromYekb(date, time ? String(time) : null, allDay);

  await prisma.note.update({
    where: { id: noteId, userId: meId },
    data: { at, allDay, title, text },
  });

  revalidatePath('/calendar');
  redirect('/calendar');
}

export async function deleteNoteAction(formData: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id;
  if (!meId) redirect('/');

  const noteId = String(formData.get('noteId') || '');
  if (!noteId) redirect('/calendar');

  await prisma.note.delete({
    where: { id: noteId, userId: meId },
  });

  revalidatePath('/calendar');
  redirect('/calendar');
}

/** ==== ЗАДАЧИ (отметить моё выполнение) ==== */
export async function markMyTaskDoneAction(formData: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id;
  if (!meId) redirect('/');

  const taskId = String(formData.get('taskId') || '');
  if (!taskId) redirect('/calendar');

  // Меняем статус только для текущего пользователя (архив на странице задач работает по тем же признакам)
  await prisma.taskAssignee.updateMany({
    where: { taskId, userId: meId, status: 'in_progress' },
    data: { status: 'done', completedAt: new Date() },
  });

  revalidatePath('/calendar');
  redirect('/calendar');
}

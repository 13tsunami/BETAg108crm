'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { normalizeRole } from '@/lib/roles';

const s = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
const b = (v: FormDataEntryValue | null) =>
  typeof v === 'string' ? (v === 'on' || v === 'true' || v === '1') : false;

async function returnToWithQuery(q: string): Promise<string> {
  const h = await headers();
  const ref = h.get('referer') || '/teachers';
  try {
    const u = new URL(ref);
    u.searchParams.delete('ok');
    u.searchParams.delete('error');
    const sep = u.search ? '&' : '?';
    return `${u.pathname}${u.search}${sep}${q}`;
  } catch {
    return `/teachers?${q}`;
  }
}

/** Создание пользователя. */
export async function createUser(fd: FormData): Promise<void> {
  const session = await auth();
  const role = normalizeRole((session?.user as any)?.role ?? null);
  const canManage = role === 'director' || role === 'deputy_plus';
  if (!canManage) redirect('/');

  const name = s(fd.get('name'));
  const username = s(fd.get('username')) || null;
  const email = s(fd.get('email')) || null;
  const phone = s(fd.get('phone')) || null;
  const classroom = s(fd.get('classroom')) || null;
  const roleNew = s(fd.get('role')) || 'teacher';
  const birthday = s(fd.get('birthday'));
  const telegram = s(fd.get('telegram')) || null;
  const about = s(fd.get('about')) || null;
  const notifyEmail = b(fd.get('notifyEmail'));
  const notifyTelegram = b(fd.get('notifyTelegram'));
  const password = s(fd.get('password'));

  if (!name) {
    revalidatePath('/teachers');
    redirect(await returnToWithQuery('error=' + encodeURIComponent('Укажите ФИО')));
  }

  const data: any = {
    name,
    username,
    email,
    phone,
    classroom,
    role: roleNew,
    telegram,
    about,
    notifyEmail,
    notifyTelegram,
  };
  if (birthday) data.birthday = new Date(birthday);
  if (password) {
    if (password.length < 6) {
      revalidatePath('/teachers');
      redirect(await returnToWithQuery('error=' + encodeURIComponent('Пароль должен быть не короче 6 символов')));
    }
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  try {
    await prisma.user.create({ data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? 'error');
    revalidatePath('/teachers');
    redirect(await returnToWithQuery('error=' + encodeURIComponent(msg)));
  }

  revalidatePath('/teachers');
  redirect(await returnToWithQuery('ok=' + encodeURIComponent('пользователь создан')));
}

/** Обновление пользователя. */
export async function updateUser(fd: FormData): Promise<void> {
  const session = await auth();
  const role = normalizeRole((session?.user as any)?.role ?? null);
  const canManage = role === 'director' || role === 'deputy_plus';
  if (!canManage) redirect('/');

  const id = s(fd.get('id'));
  if (!id) {
    revalidatePath('/teachers');
    redirect(await returnToWithQuery('error=' + encodeURIComponent('Не передан id пользователя')));
  }

  const name = s(fd.get('name')) || null;
  const username = s(fd.get('username')) || null;
  const email = s(fd.get('email')) || null;
  const phone = s(fd.get('phone')) || null;
  const classroom = s(fd.get('classroom')) || null;
  const roleNew = s(fd.get('role')) || null;
  const birthday = s(fd.get('birthday'));
  const telegram = s(fd.get('telegram')) || null;
  const about = s(fd.get('about')) || null;
  const notifyEmail = b(fd.get('notifyEmail'));
  const notifyTelegram = b(fd.get('notifyTelegram'));
  const newPassword = s(fd.get('newPassword'));

  const data: any = {
    name,
    username,
    email,
    phone,
    classroom,
    role: roleNew,
    telegram,
    about,
    notifyEmail,
    notifyTelegram,
  };
  if (birthday) data.birthday = new Date(birthday);
  if (newPassword) {
    if (newPassword.length < 6) {
      revalidatePath('/teachers');
      redirect(await returnToWithQuery('error=' + encodeURIComponent('Пароль должен быть не короче 6 символов')));
    }
    data.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  try {
    await prisma.user.update({ where: { id }, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? 'error');
    revalidatePath('/teachers');
    redirect(await returnToWithQuery('error=' + encodeURIComponent(msg)));
  }

  revalidatePath('/teachers');
  redirect(await returnToWithQuery('ok=' + encodeURIComponent('изменения сохранены')));
}

/** Удаление пользователя. */
export async function deleteUser(fd: FormData): Promise<void> {
  const session = await auth();
  const role = normalizeRole((session?.user as any)?.role ?? null);
  const canManage = role === 'director' || role === 'deputy_plus';
  if (!canManage) redirect('/');

  const id = s(fd.get('id'));
  if (!id) {
    revalidatePath('/teachers');
    redirect(await returnToWithQuery('error=' + encodeURIComponent('Не передан id пользователя')));
  }

  try {
    await prisma.user.delete({ where: { id } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? 'error');
    revalidatePath('/teachers');
    redirect(await returnToWithQuery('error=' + encodeURIComponent(msg)));
  }

  revalidatePath('/teachers');
  redirect(await returnToWithQuery('ok=' + encodeURIComponent('пользователь удалён')));
}

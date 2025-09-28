// app/(app)/settings/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { normalizeRole, canViewAdmin } from '@/lib/roles';

const s = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
const n = (v: string) => (v === '' ? null : v); // пустые строки в null
const b = (v: FormDataEntryValue | null) =>
  typeof v === 'string' ? (v === 'on' || v === 'true' || v === '1') : false;

export async function updateSelfAction(fd: FormData): Promise<void> {
  const session = await auth();
  const meId = (session?.user as any)?.id as string | undefined;
  if (!meId) redirect('/sign-in');

  // базовые мягкие поля
  const email = n(s(fd.get('email')));
  const phone = n(s(fd.get('phone')));
  const telegram = n(s(fd.get('telegram')));
  const about = n(s(fd.get('about')));
  const notifyEmail = b(fd.get('notifyEmail'));
  const notifyTelegram = b(fd.get('notifyTelegram'));
  const newPassword = s(fd.get('newPassword'));

  // дата рождения как ISO yyyy-mm-dd
  const birthdayStr = s(fd.get('birthday'));
  const birthday = birthdayStr ? new Date(birthdayStr + 'T00:00:00') : null;

  const data: Prisma.UserUpdateInput = {
    email,
    phone,
    telegram,
    about,
    notifyEmail,
    notifyTelegram,
    birthday,
  };

  // права: разрешаем «жёсткие» поля только director и deputy_plus
  const me = await prisma.user.findUnique({ where: { id: meId }, select: { role: true } });
  const isAdmin = canViewAdmin(normalizeRole(me?.role ?? null));

  if (isAdmin) {
    const name = n(s(fd.get('name')));
    const username = n(s(fd.get('username')));
    const classroom = n(s(fd.get('classroom')));
    const role = s(fd.get('role'));
    if (name !== null) (data as any).name = name;
    if (username !== null) (data as any).username = username;
    // ключевой момент: позволяем менять классное руководство
    (data as any).classroom = classroom; // null допустим, очистит значение
    // изменение роли оставляем на совести админа
    if (role) (data as any).role = role;
  }

  if (newPassword) {
    if (newPassword.length < 6) {
      revalidatePath('/settings');
      redirect('/settings?error=' + encodeURIComponent('Пароль должен быть не короче 6 символов'));
    }
    (data as any).passwordHash = await bcrypt.hash(newPassword, 10);
  }

  try {
    await prisma.user.update({ where: { id: meId }, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? 'error');
    revalidatePath('/settings');
    redirect('/settings?error=' + encodeURIComponent(msg));
  }

  revalidatePath('/settings');
  redirect('/settings?ok=1');
}

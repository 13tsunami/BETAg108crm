'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { auth } from '@/auth.config';

function s(v: FormDataEntryValue | null | undefined) { return (v == null ? '' : String(v)).trim(); }
function n(v: string) { return v ? v : null; }
function err(msg: string) { redirect(`/teachers?error=${encodeURIComponent(msg)}`); }

async function requireManager() {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  const ok = role === 'director' || role === 'deputy_plus';
  if (!ok) err('Нет прав');
}

export async function createUser(fd: FormData): Promise<void> {
  try {
    await requireManager();
    const name = s(fd.get('name')); if (!name) err('Имя обязательно');

    const role = s(fd.get('role')) || 'teacher';
    const username = n(s(fd.get('username')));
    const email = n(s(fd.get('email')));
    const phone = n(s(fd.get('phone')));
    const classroom = n(s(fd.get('classroom')));
    const telegram = n(s(fd.get('telegram')));
    const about = n(s(fd.get('about')));
    const birthdayStr = s(fd.get('birthday'));
    const notifyEmail = s(fd.get('notifyEmail')) === 'on';
    const notifyTelegram = s(fd.get('notifyTelegram')) === 'on';
    const password = s(fd.get('password'));

    await prisma.user.create({
      data: {
        name, role, username, email, phone, classroom, telegram, about,
        notifyEmail, notifyTelegram,
        birthday: birthdayStr ? new Date(birthdayStr) : null,
        passwordHash: password ? await bcrypt.hash(password, 10) : null,
      },
    });

    revalidatePath('/teachers');
    redirect('/teachers?ok=создан');
  } catch (e: any) {
    err(e?.message || 'Не удалось создать');
  }
}

export async function updateUser(fd: FormData): Promise<void> {
  try {
    await requireManager();
    const id = s(fd.get('id')); if (!id) err('Нет ID');

    const patch: Record<string, unknown> = {};
    const name = s(fd.get('name')); if (name) patch.name = name;
    const role = s(fd.get('role')); if (role) patch.role = role;

    (['username','email','phone','classroom','telegram','about'] as const).forEach((k) => {
      const v = s(fd.get(k));
      if (v) patch[k] = v;
      if (v === '') patch[k] = null;
    });

    const birthday = s(fd.get('birthday'));
    if (birthday) patch.birthday = new Date(birthday);
    if (birthday === '') patch.birthday = null;

    const ne = fd.get('notifyEmail'); if (ne != null) patch.notifyEmail = s(ne) === 'on';
    const nt = fd.get('notifyTelegram'); if (nt != null) patch.notifyTelegram = s(nt) === 'on';

    const newPassword = s(fd.get('newPassword'));
    if (newPassword) patch.passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({ where: { id }, data: patch });

    revalidatePath('/teachers');
    redirect('/teachers?ok=сохранено');
  } catch (e: any) {
    err(e?.message || 'Не удалось сохранить');
  }
}

export async function deleteUser(fd: FormData): Promise<void> {
  try {
    await requireManager();
    const id = s(fd.get('id')); if (!id) err('Нет ID');
    await prisma.user.delete({ where: { id } });
    revalidatePath('/teachers');
    redirect('/teachers?ok=удалён');
  } catch (e: any) {
    err(e?.message || 'Не удалось удалить');
  }
}

export async function archiveUser(fd: FormData): Promise<void> {
  try {
    await requireManager();
    const id = s(fd.get('id')); if (!id) err('Нет ID');
    await prisma.user.update({ where: { id }, data: { role: 'archived' } });
    revalidatePath('/teachers');
    redirect('/teachers?ok=архивирован');
  } catch (e: any) {
    err(e?.message || 'Не удалось архивировать');
  }
}

export async function forceResetPassword(fd: FormData): Promise<void> {
  try {
    await requireManager();
    const id = s(fd.get('id'));
    const newPassword = s(fd.get('newPassword'));
    if (!id || !newPassword) err('Нет данных для смены пароля');
    await prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    revalidatePath('/teachers');
    redirect('/teachers?ok=пароль+сменён');
  } catch (e: any) {
    err(e?.message || 'Не удалось сменить пароль');
  }
}

'use server';

import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

function s(v: FormDataEntryValue | null): string { return typeof v === 'string' ? v.trim() : ''; }

export async function updateSelfAction(fd: FormData): Promise<void> {
  const session = await auth();
  const meId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!meId) redirect('/sign-in');

  const isRestricted = role === 'teacher' || role === 'teacher_plus' || role === 'deputy';

  const name = s(fd.get('name'));
  const username = s(fd.get('username'));
  const email = s(fd.get('email'));
  const phone = s(fd.get('phone'));
  const classroom = s(fd.get('classroom'));
  const roleNew = s(fd.get('role'));
  const birthday = s(fd.get('birthday'));
  const telegram = s(fd.get('telegram'));
  const about = s(fd.get('about'));
  const notifyEmail = s(fd.get('notifyEmail')) === 'on';
  const notifyTelegram = s(fd.get('notifyTelegram')) === 'on';
  const newPassword = s(fd.get('newPassword'));

  const data: any = {
    email: email || null,
    phone: phone || null,
    telegram: telegram || null,
    about: about || null,
    notifyEmail,
    notifyTelegram,
  };

  if (!isRestricted) {
    if (name) data.name = name;
    data.username = username || null;
    data.classroom = classroom || null;
    data.role = roleNew || role || 'teacher';
    data.birthday = birthday ? new Date(birthday) : null;
  }

  try {
    await prisma.user.update({ where: { id: meId }, data });
    if (newPassword) {
      // если у вас есть таблица/поле для пароля — добавьте сюда изменение пароля по вашей модели
      // например: await prisma.user.update({ where: { id: meId }, data: { passwordHash: hash(newPassword) }});
    }
    redirect('/settings?ok=updated');
  } catch (e: any) {
    const msg = e?.message || 'update_failed';
    redirect(`/settings?error=${encodeURIComponent(msg)}`);
  }
}

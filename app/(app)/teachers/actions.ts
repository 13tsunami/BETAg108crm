'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth.config';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
const toBool = (v: FormDataEntryValue | null) =>
  typeof v === 'string' ? (v === 'on' || v === 'true' || v === '1') : false;

// нормализация телефона: только цифры, пустое → null
const normPhone = (v: string) => {
  const digits = v.replace(/\D+/g, '');
  return digits.length ? digits : '';
};
// e-mail/логин приводим к нижнему регистру, пустое → ''
const normLower = (v: string) => v.toLowerCase();

async function requireManager() {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (role !== 'director' && role !== 'deputy_plus') redirect('/teachers?error=нет_прав');
}

function done(ok: string) {
  revalidatePath('/teachers');
  redirect(`/teachers?ok=${encodeURIComponent(ok)}`);
}
function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e ?? 'error');
  revalidatePath('/teachers');
  redirect(`/teachers?error=${encodeURIComponent(msg)}`);
}
function uniqueFail(e: any) {
  if (e?.code === 'P2002') {
    const t = Array.isArray(e?.meta?.target) ? e.meta.target as string[] : [];
    const field = t[0] ?? 'поле';
    return fail(`Нарушено уникальное ограничение: ${field}`);
  }
  return fail(e);
}

/** CREATE */
export async function createUser(fd: FormData): Promise<void> {
  await requireManager();

  const name = str(fd.get('name'));
  if (!name) redirect('/teachers?error=не_указано_имя');

  const rawUsername = str(fd.get('username'));
  const rawEmail = str(fd.get('email'));
  const rawPhone = str(fd.get('phone'));
  const classroom = str(fd.get('classroom')) || '';
  const role = str(fd.get('role')) || 'teacher';
  const birthday = str(fd.get('birthday'));
  const telegram = str(fd.get('telegram')) || '';
  const about = str(fd.get('about')) || '';
  const notifyEmail = toBool(fd.get('notifyEmail'));
  const notifyTelegram = toBool(fd.get('notifyTelegram'));
  const rawPassword = str(fd.get('password'));

  const username = rawUsername ? normLower(rawUsername) : '';
  const email = rawEmail ? normLower(rawEmail) : '';
  const phone = rawPhone ? normPhone(rawPhone) : '';

  try {
    const passwordHash = rawPassword ? await bcrypt.hash(rawPassword, 10) : null;

    await prisma.user.create({
      data: {
        name,
        username: username || null,
        email: email || null,
        phone: phone || null,
        classroom: classroom || null,
        role,
        birthday: birthday ? new Date(birthday) : null,
        telegram: telegram || null,
        about: about || null,
        notifyEmail,
        notifyTelegram,
        passwordHash,
      },
    });

    done('создан пользователь');
  } catch (e: any) {
    return uniqueFail(e);
  }
}

/** UPDATE */
export async function updateUser(fd: FormData): Promise<void> {
  await requireManager();

  const id = str(fd.get('id'));
  if (!id) redirect('/teachers?error=нет_id');

  const name = str(fd.get('name'));
  if (!name) redirect('/teachers?error=не_указано_имя');

  const rawUsername = str(fd.get('username'));
  const rawEmail = str(fd.get('email'));
  const rawPhone = str(fd.get('phone'));
  const classroom = str(fd.get('classroom')) || '';
  const role = str(fd.get('role')) || 'teacher';
  const birthday = str(fd.get('birthday'));
  const telegram = str(fd.get('telegram')) || '';
  const about = str(fd.get('about')) || '';
  const notifyEmail = toBool(fd.get('notifyEmail'));
  const notifyTelegram = toBool(fd.get('notifyTelegram'));
  const newPassword = str(fd.get('newPassword'));

  const username = rawUsername ? normLower(rawUsername) : '';
  const email = rawEmail ? normLower(rawEmail) : '';
  const phone = rawPhone ? normPhone(rawPhone) : '';

  try {
    const data: Prisma.UserUpdateInput = {
      name,
      username: username || null,
      email: email || null,
      phone: phone || null,
      classroom: classroom || null,
      role,
      birthday: birthday ? new Date(birthday) : null,
      telegram: telegram || null,
      about: about || null,
      notifyEmail,
      notifyTelegram,
    };

    if (newPassword) {
      if (newPassword.length < 6) throw new Error('Пароль должен быть не короче 6 символов');
      (data as any).passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await prisma.user.update({ where: { id }, data });
    done('изменения сохранены');
  } catch (e: any) {
    return uniqueFail(e);
  }
}

/** DELETE */
export async function deleteUser(fd: FormData): Promise<void> {
  await requireManager();

  const id = str(fd.get('id'));
  if (!id) redirect('/teachers?error=нет_id');

  try {
    await prisma.$transaction(async (tx) => {
      try { await (tx as any).message.deleteMany({ where: { authorId: id } }); } catch {}
      try { await (tx as any).thread.deleteMany({ where: { OR: [{ aId: id }, { bId: id }] } }); } catch {}
      try { await (tx as any).readMark.deleteMany({ where: { userId: id } }); } catch {}
      try { await (tx as any).task.deleteMany({ where: { authorId: id } }); } catch {}
      try { await (tx as any).taskAssignee.deleteMany({ where: { userId: id } }); } catch {}
      try { await (tx as any).groupMember.deleteMany({ where: { userId: id } }); } catch {}

      await tx.user.delete({ where: { id } });
    });

    done('пользователь удалён');
  } catch (e) {
    fail(e);
  }
}

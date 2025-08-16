// app/(app)/teachers/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth.config';
import { normalizeRole, type Role } from '@/lib/roles';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';

/** утилиты парсинга/нормализации */
const s = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
const toBool = (v: FormDataEntryValue | null) =>
  typeof v === 'string' ? v === 'on' || v === 'true' || v === '1' : false;

const normLower = (v: string) => v.toLowerCase();
const normPhone = (v: string) => v.replace(/\D+/g, '');
const reqStr = (v: FormDataEntryValue | null, field: string) => {
  const vv = s(v);
  if (!vv) throw new Error(`Поле ${field} обязательно`);
  return vv;
};

async function requireCanManage(): Promise<{ meId: string; role: Role | null }> {
  const session = await auth();
  const meId = (session?.user as any)?.id as string | undefined;
  const role = normalizeRole((session?.user as any)?.role ?? null);
  if (!meId) redirect('/sign-in');
  if (!(role === 'director' || role === 'deputy_plus')) redirect('/teachers?error=нет_прав');
  return { meId: meId!, role };
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
    const t = Array.isArray(e?.meta?.target) ? (e.meta.target as string[]).join(', ') : 'уникальные поля';
    return fail(`Нарушено уникальное ограничение (${t})`);
  }
  return fail(e);
}

/** CREATE: создаёт пользователя; если передан password — хэширует и сохраняет */
export async function createUser(fd: FormData): Promise<void> {
  await requireCanManage();

  const name = reqStr(fd.get('name'), 'name');

  const usernameRaw = s(fd.get('username'));
  const emailRaw = s(fd.get('email'));
  const phoneRaw = s(fd.get('phone'));
  const classroom = s(fd.get('classroom'));
  const role = s(fd.get('role')) || 'teacher';
  const birthday = s(fd.get('birthday'));
  const telegram = s(fd.get('telegram'));
  const about = s(fd.get('about'));
  const notifyEmail = toBool(fd.get('notifyEmail'));
  const notifyTelegram = toBool(fd.get('notifyTelegram'));
  const passwordRaw = s(fd.get('password'));

  const username = usernameRaw ? normLower(usernameRaw) : '';
  const email = emailRaw ? normLower(emailRaw) : '';
  const phone = phoneRaw ? normPhone(phoneRaw) : '';

  try {
    const passwordHash = passwordRaw ? await bcrypt.hash(passwordRaw, 10) : null;

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

/** UPDATE: редактирует карточку; если передан newPassword — хэширует и сохраняет */
export async function updateUser(fd: FormData): Promise<void> {
  await requireCanManage();

  const id = reqStr(fd.get('id'), 'id');
  const name = reqStr(fd.get('name'), 'name');

  const usernameRaw = s(fd.get('username'));
  const emailRaw = s(fd.get('email'));
  const phoneRaw = s(fd.get('phone'));
  const classroom = s(fd.get('classroom'));
  const role = s(fd.get('role')) || 'teacher';
  const birthday = s(fd.get('birthday'));
  const telegram = s(fd.get('telegram'));
  const about = s(fd.get('about'));
  const notifyEmail = toBool(fd.get('notifyEmail'));
  const notifyTelegram = toBool(fd.get('notifyTelegram'));
  const newPassword = s(fd.get('newPassword'));

  const username = usernameRaw ? normLower(usernameRaw) : '';
  const email = emailRaw ? normLower(emailRaw) : '';
  const phone = phoneRaw ? normPhone(phoneRaw) : '';

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

/** DELETE: удаляет пользователя; каскады выполняет БД (onDelete: Cascade) */
export async function deleteUser(formData: FormData): Promise<void> {
  await requireCanManage();
  const id = reqStr(formData.get('id'), 'id');

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id } });
    });

    done('пользователь удалён');
  } catch (e) {
    const msg =
      e instanceof Error && /violates foreign key|foreign key constraint/i.test(e.message)
        ? 'Невозможно удалить: есть связанные записи. Примените миграцию с onDelete: Cascade.'
        : e;
    return fail(msg as any);
  }
}

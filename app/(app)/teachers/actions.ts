// app/(app)/teachers/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth.config';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';

const s = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
const b = (v: FormDataEntryValue | null) =>
  typeof v === 'string' ? (v === 'on' || v === 'true' || v === '1') : false;

async function requireManager() {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (role !== 'director' && role !== 'deputy_plus') redirect('/teachers?error=нет_прав');
}

function done(msg: string) {
  revalidatePath('/teachers');
  redirect(`/teachers?ok=${encodeURIComponent(msg)}`);
}
function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e ?? 'error');
  revalidatePath('/teachers');
  redirect(`/teachers?error=${encodeURIComponent(msg)}`);
}

/** Создание пользователя (+ пароль, если передан) */
export async function createUser(fd: FormData): Promise<void> {
  await requireManager();

  const name = s(fd.get('name'));
  if (!name) redirect('/teachers?error=не_указано_имя');

  const username = s(fd.get('username')) || null;
  const email = s(fd.get('email')) || null;
  const phone = s(fd.get('phone')) || null;
  const classroom = s(fd.get('classroom')) || null;
  const role = s(fd.get('role')) || 'teacher';
  const birthday = s(fd.get('birthday'));
  const telegram = s(fd.get('telegram')) || null;
  const about = s(fd.get('about')) || null;
  const notifyEmail = b(fd.get('notifyEmail'));
  const notifyTelegram = b(fd.get('notifyTelegram'));
  const rawPassword = s(fd.get('password')) || '';

  try {
    const passwordHash = rawPassword ? await bcrypt.hash(rawPassword, 10) : null;

    await prisma.user.create({
      data: {
        name,
        username,
        email,
        phone,
        classroom,
        role,
        birthday: birthday ? new Date(birthday) : null,
        telegram,
        about,
        notifyEmail,
        notifyTelegram,
        passwordHash,
      },
    });

    done('создано');
  } catch (e) {
    fail(e);
  }
}

/** Обновление профиля педагога (+ смена пароля, если передан newPassword) */
export async function updateUser(fd: FormData): Promise<void> {
  await requireManager();

  const id = s(fd.get('id'));
  if (!id) redirect('/teachers?error=нет_id');

  const name = s(fd.get('name'));
  if (!name) redirect('/teachers?error=не_указано_имя');

  const username = s(fd.get('username')) || null;
  const email = s(fd.get('email')) || null;
  const phone = s(fd.get('phone')) || null;
  const classroom = s(fd.get('classroom')) || null;
  const role = s(fd.get('role')) || 'teacher';
  const birthday = s(fd.get('birthday'));
  const telegram = s(fd.get('telegram')) || null;
  const about = s(fd.get('about')) || null;
  const notifyEmail = b(fd.get('notifyEmail'));
  const notifyTelegram = b(fd.get('notifyTelegram'));
  const newPassword = s(fd.get('newPassword')) || '';

  try {
    const data: Prisma.UserUpdateInput = {
      name,
      username,
      email,
      phone,
      classroom,
      role,
      birthday: birthday ? new Date(birthday) : null,
      telegram,
      about,
      notifyEmail,
      notifyTelegram,
    };

    if (newPassword) {
      (data as any).passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await prisma.user.update({ where: { id }, data });
    done('сохранено');
  } catch (e) {
    fail(e);
  }
}

/** Удаление пользователя. С JWT-сессиями БД-сессий нет — см. правку в auth.config.ts. */
export async function deleteUser(fd: FormData): Promise<void> {
  await requireManager();

  const id = s(fd.get('id'));
  if (!id) redirect('/teachers?error=нет_id');

  try {
    await prisma.$transaction(async (tx) => {
      // Мягкая зачистка следов — если таблиц нет в схеме, просто пропустим.
      try { await (tx as any).message.deleteMany({ where: { authorId: id } }); } catch {}
      try { await (tx as any).thread.deleteMany({ where: { OR: [{ aId: id }, { bId: id }] } }); } catch {}
      try { await (tx as any).readMark.deleteMany({ where: { userId: id } }); } catch {}
      try { await (tx as any).task.deleteMany({ where: { authorId: id } }); } catch {}
      try { await (tx as any).taskAssignee.deleteMany({ where: { userId: id } }); } catch {}
      try { await (tx as any).groupMember.deleteMany({ where: { userId: id } }); } catch {}

      await tx.user.delete({ where: { id } });
    });

    done('удалено');
  } catch (e) {
    fail(e);
  }
}

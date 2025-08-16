'use server';

import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';

function now() { return new Date(); }
function s(v: FormDataEntryValue | null): string { return typeof v === 'string' ? v.trim() : ''; }

async function requireManager() {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (role !== 'director' && role !== 'deputy_plus') redirect('/teachers?error=нет_прав');
  return true;
}

/** Создание */
export async function createUser(fd: FormData): Promise<void> {
  await requireManager();

  const name = s(fd.get('name'));
  const username = s(fd.get('username'));
  const email = s(fd.get('email'));
  const phone = s(fd.get('phone'));
  const classroom = s(fd.get('classroom'));
  const role = s(fd.get('role')) || 'teacher';
  const birthday = s(fd.get('birthday'));
  const telegram = s(fd.get('telegram'));
  const about = s(fd.get('about'));
  const notifyEmail = s(fd.get('notifyEmail')) === 'on';
  const notifyTelegram = s(fd.get('notifyTelegram')) === 'on';

  if (!name) redirect('/teachers?error=не_указано_имя');

  try {
    await prisma.user.create({
      data: {
        name, username: username || null, email: email || null, phone: phone || null,
        classroom: classroom || null, role, birthday: birthday ? new Date(birthday) : null,
        telegram: telegram || null, about: about || null,
        notifyEmail, notifyTelegram, lastSeen: now(),
      },
    });
    redirect('/teachers?ok=создано');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    redirect(`/teachers?error=${encodeURIComponent(msg)}`);
  }
}

/** Обновление */
export async function updateUser(fd: FormData): Promise<void> {
  await requireManager();

  const id = s(fd.get('id'));
  const name = s(fd.get('name'));
  const username = s(fd.get('username'));
  const email = s(fd.get('email'));
  const phone = s(fd.get('phone'));
  const classroom = s(fd.get('classroom'));
  const role = s(fd.get('role')) || 'teacher';
  const birthday = s(fd.get('birthday'));
  const telegram = s(fd.get('telegram'));
  const about = s(fd.get('about'));
  const notifyEmail = s(fd.get('notifyEmail')) === 'on';
  const notifyTelegram = s(fd.get('notifyTelegram')) === 'on';

  if (!id) redirect('/teachers?error=нет_id');
  if (!name) redirect('/teachers?error=не_указано_имя');

  try {
    await prisma.user.update({
      where: { id },
      data: {
        name, username: username || null, email: email || null, phone: phone || null,
        classroom: classroom || null, role, birthday: birthday ? new Date(birthday) : null,
        telegram: telegram || null, about: about || null,
        notifyEmail, notifyTelegram,
      },
    });
    redirect('/teachers?ok=обновлено');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    redirect(`/teachers?error=${encodeURIComponent(msg)}`);
  }
}

/**
 * Удаление.
 * 1) Пытаемся физически удалить.
 * 2) Если БД блокирует внешними ключами (Prisma P2003) — переводим в archived и зачищаем ПД.
 *    Это гарантирует, что в интерфейсе «исчезнет», а связность данных не сломаем.
 */
export async function deleteUser(fd: FormData): Promise<void> {
  await requireManager();
  const id = s(fd.get('id'));
  if (!id) redirect('/teachers?error=нет_id');

  try {
    await prisma.user.delete({ where: { id } });
    redirect('/teachers?ok=удалено');
  } catch (e: any) {
    const isFK =
      e && typeof e === 'object' &&
      'code' in e && (e as any).code === 'P2003';

    if (!isFK) {
      const msg = e instanceof Error ? e.message : 'unknown';
      redirect(`/teachers?error=${encodeURIComponent(msg)}`);
      return;
    }

    // Мягкое удаление: архив + анонимизация
    try {
      await prisma.user.update({
        where: { id },
        data: {
          role: 'archived',
          name: 'Удалённый пользователь',
          username: null,
          email: null,
          phone: null,
          classroom: null,
          telegram: null,
          about: null,
          notifyEmail: false,
          notifyTelegram: false,
        },
      });
      redirect('/teachers?ok=перемещён_в_архив');
    } catch (e2) {
      const msg = e2 instanceof Error ? e2.message : 'unknown';
      redirect(`/teachers?error=${encodeURIComponent(msg)}`);
    }
  }
}

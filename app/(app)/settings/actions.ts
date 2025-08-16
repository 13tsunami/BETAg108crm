// app/(app)/settings/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';

const s = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
const b = (v: FormDataEntryValue | null) =>
  typeof v === 'string' ? (v === 'on' || v === 'true' || v === '1') : false;

function done() {
  revalidatePath('/settings');
  redirect('/settings?ok=1');
}
function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e ?? 'error');
  revalidatePath('/settings');
  redirect(`/settings?error=${encodeURIComponent(msg)}`);
}

/** Смена собственного пароля и обновление мягких полей профиля. */
export async function updateSelfAction(fd: FormData): Promise<void> {
  const session = await auth();
  const meId = (session?.user as any)?.id as string | undefined;
  if (!meId) redirect('/sign-in');

  const email = s(fd.get('email')) || null;
  const phone = s(fd.get('phone')) || null;
  const telegram = s(fd.get('telegram')) || null;
  const about = s(fd.get('about')) || null;
  const notifyEmail = b(fd.get('notifyEmail'));
  const notifyTelegram = b(fd.get('notifyTelegram'));
  const newPassword = s(fd.get('newPassword'));

  const data: Prisma.UserUpdateInput = {
    email,
    phone,
    telegram,
    about,
    notifyEmail,
    notifyTelegram,
  };

  try {
    if (newPassword) {
      if (newPassword.length < 6) throw new Error('Пароль должен быть не короче 6 символов');
      (data as any).passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await prisma.user.update({ where: { id: meId }, data });
    done();
  } catch (e) {
    fail(e);
  }
}

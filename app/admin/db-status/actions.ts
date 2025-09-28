// app/admin/db-status/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth.config';
import { normalizeRole, canViewAdmin, type Role } from '@/lib/roles';

function requireString(v: FormDataEntryValue | null, field: string): string {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`Поле ${field} обязательно`);
  }
  return v.trim();
}

function optionalString(v: FormDataEntryValue | null): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function pickRole(v: FormDataEntryValue | null): Role | null {
  return normalizeRole(typeof v === 'string' ? v : null);
}

async function requireAdmin(): Promise<void> {
  const session = await auth();
  const role = normalizeRole((session?.user as any)?.role ?? null);
  if (!canViewAdmin(role)) {
    redirect('/'); // немедленный отказ без утечки статуса операции
  }
}

export async function upsertUser(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = optionalString(formData.get('id'));
  const name = requireString(formData.get('name'), 'name');
  const usernameRaw = optionalString(formData.get('username'));
  const username = usernameRaw ? usernameRaw.toLowerCase() : null; // единый регистр
  const email = optionalString(formData.get('email'));
  const phone = optionalString(formData.get('phone'));
  const role = pickRole(formData.get('role')); // Role | null
  const subjects = optionalString(formData.get('subjects'));
  const methodicalGroups = optionalString(formData.get('methodicalGroups'));

  try {
    await prisma.user.upsert({
      // при отсутствии id используем заведомо пустой UUID, чтобы сработал create
      where: { id: id ?? '00000000-0000-0000-0000-000000000000' },
      update: { name, username, email, phone, role, subjects, methodicalGroups },
      create: { name, username, email, phone, role, subjects, methodicalGroups },
    });

    revalidatePath('/admin/db-status');
    redirect('/admin/db-status?ok=upsert');
  } catch (e: any) {
    // Prisma P2002 — нарушение уникальности, P2003 — внешние ключи и т. п.
    const msg = typeof e?.message === 'string' ? e.message : 'Ошибка сохранения';
    revalidatePath('/admin/db-status');
    redirect(`/admin/db-status?error=${encodeURIComponent(msg)}`);
  }
}

export async function forceResetPassword(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = requireString(formData.get('id'), 'id');
  const newPassword = requireString(formData.get('newPassword'), 'newPassword');
  const passwordHash = await bcrypt.hash(newPassword, 10);

  try {
    await prisma.user.update({ where: { id }, data: { passwordHash } });
    revalidatePath('/admin/db-status');
    redirect('/admin/db-status?ok=reset');
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : 'Ошибка сброса пароля';
    revalidatePath('/admin/db-status');
    redirect(`/admin/db-status?error=${encodeURIComponent(msg)}`);
  }
}

export async function deleteUser(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = requireString(formData.get('id'), 'id');

  try {
    await prisma.user.delete({ where: { id } });
    revalidatePath('/admin/db-status');
    redirect('/admin/db-status?ok=deleted');
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : 'Ошибка удаления';
    revalidatePath('/admin/db-status');
    redirect(`/admin/db-status?error=${encodeURIComponent(msg)}`);
  }
}

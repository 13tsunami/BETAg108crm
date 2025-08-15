// app/admin/db-status/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { normalizeRole, Role } from '@/lib/roles';

// остальной код без изменений


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

export async function upsertUser(formData: FormData): Promise<void> {
  const id = optionalString(formData.get('id'));
  const name = requireString(formData.get('name'), 'name');
  const username = optionalString(formData.get('username'));
  const email = optionalString(formData.get('email'));
  const phone = optionalString(formData.get('phone'));
  const role = pickRole(formData.get('role')); // Role | null — тип совпадает с нашими предикатами

  await prisma.user.upsert({
    where: { id: id ?? '00000000-0000-0000-0000-000000000000' }, // заведомо несуществующий, чтобы сработал create
    update: { name, username, email, phone, role },
    create: {
      name,
      username,
      email,
      phone,
      role,
    },
  });

  revalidatePath('/admin/db-status');
  redirect('/admin/db-status?ok=upsert');
}

export async function forceResetPassword(formData: FormData): Promise<void> {
  const id = requireString(formData.get('id'), 'id');
  const newPassword = requireString(formData.get('newPassword'), 'newPassword');

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id },
    data: { passwordHash },
  });

  revalidatePath('/admin/db-status');
  redirect('/admin/db-status?ok=reset');
}

export async function deleteUser(formData: FormData): Promise<void> {
  const id = requireString(formData.get('id'), 'id');
  await prisma.user.delete({ where: { id } });

  revalidatePath('/admin/db-status');
  redirect('/admin/db-status?ok=deleted');
}

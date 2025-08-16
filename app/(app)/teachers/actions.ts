// app/(app)/teachers/actions.ts
'use server';

import type { Session } from 'next-auth';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const MANAGER_ROLES = new Set(['director', 'deputy_plus'] as const);

function toStr(fd: FormData, k: string) {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
}
function toBool(fd: FormData, k: string) {
  const v = fd.get(k);
  return v === 'on' || v === 'true' || v === '1';
}

type HasRole = { role?: unknown };
function roleFrom(session: Session | null): string | null {
  const u = session?.user as unknown;
  if (u && typeof u === 'object' && 'role' in (u as Record<string, unknown>)) {
    const r = (u as HasRole).role;
    return typeof r === 'string' ? r : null;
  }
  return null;
}
function mustManage(session: Session | null) {
  const role = roleFrom(session);
  if (!role || !MANAGER_ROLES.has(role as (typeof MANAGER_ROLES extends Set<infer R> ? R : never))) {
    redirect('/');
  }
}

export async function createUser(fd: FormData): Promise<void> {
  const session = await auth(); mustManage(session);

  const data = {
    name:      toStr(fd, 'name') || 'Без имени',
    username:  toStr(fd, 'username') || null,
    email:     toStr(fd, 'email') || null,
    phone:     toStr(fd, 'phone') || null,
    classroom: toStr(fd, 'classroom') || null,
    role:      toStr(fd, 'role') || 'teacher',
    birthday:  toStr(fd, 'birthday') ? new Date(toStr(fd, 'birthday')) : null,
    telegram:  toStr(fd, 'telegram') || null,
    about:     toStr(fd, 'about') || null,
    notifyEmail: toBool(fd, 'notifyEmail'),
    notifyTelegram: toBool(fd, 'notifyTelegram'),
  };

  await prisma.user.create({ data });
  revalidatePath('/teachers');
  redirect('/teachers?ok=пользователь создан');
}

export async function updateUser(fd: FormData): Promise<void> {
  const session = await auth(); mustManage(session);
  const id = toStr(fd, 'id');
  if (!id) redirect('/teachers?error=нет id');

  const data = {
    name:      toStr(fd, 'name') || 'Без имени',
    username:  toStr(fd, 'username') || null,
    email:     toStr(fd, 'email') || null,
    phone:     toStr(fd, 'phone') || null,
    classroom: toStr(fd, 'classroom') || null,
    role:      toStr(fd, 'role') || 'teacher',
    birthday:  toStr(fd, 'birthday') ? new Date(toStr(fd, 'birthday')) : null,
    telegram:  toStr(fd, 'telegram') || null,
    about:     toStr(fd, 'about') || null,
    notifyEmail: toBool(fd, 'notifyEmail'),
    notifyTelegram: toBool(fd, 'notifyTelegram'),
  };

  await prisma.user.update({ where: { id }, data });
  revalidatePath('/teachers');
  redirect('/teachers?ok=данные обновлены');
}

export async function archiveUser(fd: FormData): Promise<void> {
  const session = await auth(); mustManage(session);
  const id = toStr(fd, 'id');
  if (!id) redirect('/teachers?error=нет id');

  await prisma.user.update({ where: { id }, data: { role: 'archived' } });
  revalidatePath('/teachers');
  redirect('/teachers?ok=пользователь в архиве');
}

/** Полный purge пользователя и всех связей. */
export async function deleteUser(fd: FormData): Promise<void> {
  const session = await auth(); mustManage(session);
  const id = toStr(fd, 'id');
  if (!id) redirect('/teachers?error=нет id');

  const u = await prisma.user.findUnique({ where: { id }, select: { email: true } });

  await prisma.$transaction(async (tx) => {
    // next-auth
    await tx.$executeRaw`DELETE FROM "Session" WHERE "userId" = ${id};`;
    await tx.$executeRaw`DELETE FROM "Account" WHERE "userId" = ${id};`;
    if (u?.email) await tx.$executeRaw`DELETE FROM "VerificationToken" WHERE "identifier" = ${u.email};`;

    // чаты
    await tx.$executeRaw`DELETE FROM "MessageHide" WHERE "userId" = ${id};`;
    await tx.$executeRaw`
      DELETE FROM "MessageHide" h
      WHERE h."messageId" IN (
        SELECT m.id FROM "Message" m
        WHERE m."threadId" IN (SELECT t.id FROM "Thread" t WHERE t."aId" = ${id} OR t."bId" = ${id})
      );
    `;
    await tx.$executeRaw`
      DELETE FROM "ReadMark"
      WHERE "userId" = ${id}
         OR "threadId" IN (SELECT t.id FROM "Thread" t WHERE t."aId" = ${id} OR t."bId" = ${id});
    `;
    await tx.$executeRaw`
      DELETE FROM "Message"
      WHERE "authorId" = ${id}
         OR "threadId" IN (SELECT t.id FROM "Thread" t WHERE t."aId" = ${id} OR t."bId" = ${id});
    `;
    await tx.$executeRaw`DELETE FROM "Thread" WHERE "aId" = ${id} OR "bId" = ${id};`;

    // будущие сущности с типовыми user-колонками
    await tx.$executeRawUnsafe(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_name IN ('userId','authorId','assigneeId','createdById','updatedById','ownerId','participantId')
        LOOP
          EXECUTE format('DELETE FROM public.%I WHERE "%I" = $1', r.table_name, r.column_name) USING $1;
        END LOOP;
      END $$;
    `, id);

    // подчистить сироты
    await tx.$executeRaw`DELETE FROM "MessageHide" h WHERE NOT EXISTS (SELECT 1 FROM "Message" m WHERE m.id = h."messageId");`;
    await tx.$executeRaw`DELETE FROM "ReadMark" r  WHERE NOT EXISTS (SELECT 1 FROM "Thread"  t WHERE t.id = r."threadId");`;

    await tx.user.delete({ where: { id } });
  });

  revalidatePath('/teachers');
  redirect('/teachers?ok=пользователь удалён полностью');
}

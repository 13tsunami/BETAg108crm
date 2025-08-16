'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth.config';
import { normalizeRole, type Role } from '@/lib/roles';

function ensureAccess(role: Role | null | undefined) {
  const ok = role === 'director' || role === 'deputy_plus';
  if (!ok) throw new Error('forbidden');
}

async function guard() {
  const session = await auth();
  const role = normalizeRole((session?.user as any)?.role ?? null);
  ensureAccess(role);
}

// ===== ГРУППЫ =====

export async function createGroup(name: string): Promise<void> {
  await guard();
  const title = (name ?? '').trim();
  if (!title) return;
  await prisma.group.create({ data: { name: title } });
  revalidatePath('/groups');
}

export async function renameGroup(groupId: string, name: string): Promise<void> {
  await guard();
  const id = String(groupId ?? '');
  const title = (name ?? '').trim();
  if (!id || !title) return;
  await prisma.group.update({ where: { id }, data: { name: title } });
  revalidatePath('/groups');
}

export async function deleteGroup(groupId: string): Promise<void> {
  await guard();
  const id = String(groupId ?? '');
  if (!id) return;
  await prisma.groupMember.deleteMany({ where: { groupId: id } });
  await prisma.group.delete({ where: { id } });
  revalidatePath('/groups');
}

export async function addUsersToGroup(groupId: string, userIds: string[]): Promise<void> {
  await guard();
  const gid = String(groupId ?? '');
  const ids = Array.isArray(userIds) ? userIds.filter(Boolean).map(String) : [];
  if (!gid || ids.length === 0) return;

  await prisma.$transaction(
    ids.map((uid) =>
      prisma.groupMember.upsert({
        where: { userId_groupId: { userId: uid, groupId: gid } }, // работает благодаря @@unique([userId, groupId])
        create: { userId: uid, groupId: gid },
        update: {},
      }),
    ),
  );

  revalidatePath('/groups');
}

export async function removeUserFromGroup(groupId: string, userId: string): Promise<void> {
  await guard();
  const gid = String(groupId ?? '');
  const uid = String(userId ?? '');
  if (!gid || !uid) return;
  await prisma.groupMember.deleteMany({ where: { groupId: gid, userId: uid } });
  revalidatePath('/groups');
}

export async function fetchGroupMembers(groupId: string): Promise<{ userId: string; name: string | null }[]> {
  await guard();
  const gid = String(groupId ?? '');
  if (!gid) return [];
  const rows = await prisma.groupMember.findMany({
    where: { groupId: gid },
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ user: { name: 'asc' } }],
  });
  return rows.map((r) => ({ userId: r.userId, name: r.user?.name ?? r.userId }));
}

// ===== ПРЕДМЕТЫ =====

export async function createSubject(name: string): Promise<void> {
  await guard();
  const title = (name ?? '').trim();
  if (!title) return;
  await prisma.subject.create({ data: { name: title } });
  revalidatePath('/groups');
}

export async function renameSubject(subjectId: string, name: string): Promise<void> {
  await guard();
  const id = String(subjectId ?? '');
  const title = (name ?? '').trim();
  if (!id || !title) return;
  await prisma.subject.update({ where: { id }, data: { name: title } });
  revalidatePath('/groups');
}

export async function deleteSubject(subjectId: string): Promise<void> {
  await guard();
  const id = String(subjectId ?? '');
  if (!id) return;
  await prisma.subjectMember.deleteMany({ where: { subjectId: id } });
  await prisma.subject.delete({ where: { id } });
  revalidatePath('/groups');
}

export async function addUsersToSubject(subjectId: string, userIds: string[]): Promise<void> {
  await guard();
  const sid = String(subjectId ?? '');
  const ids = Array.isArray(userIds) ? userIds.filter(Boolean).map(String) : [];
  if (!sid || ids.length === 0) return;

  await prisma.$transaction(
    ids.map((uid) =>
      prisma.subjectMember.upsert({
        where: { userId_subjectId: { userId: uid, subjectId: sid } }, // работает благодаря @@unique([userId, subjectId])
        create: { userId: uid, subjectId: sid },
        update: {},
      }),
    ),
  );

  revalidatePath('/groups');
}

export async function removeUserFromSubject(subjectId: string, userId: string): Promise<void> {
  await guard();
  const sid = String(subjectId ?? '');
  const uid = String(userId ?? '');
  if (!sid || !uid) return;
  await prisma.subjectMember.deleteMany({ where: { subjectId: sid, userId: uid } });
  revalidatePath('/groups');
}

export async function fetchSubjectMembers(subjectId: string): Promise<{ userId: string; name: string | null }[]> {
  await guard();
  const sid = String(subjectId ?? '');
  if (!sid) return [];
  const rows = await prisma.subjectMember.findMany({
    where: { subjectId: sid },
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ user: { name: 'asc' } }],
  });
  return rows.map((r) => ({ userId: r.userId, name: r.user?.name ?? r.userId }));
}

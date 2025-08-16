import { auth } from '@/auth.config';
import { redirect } from 'next/navigation';
import { normalizeRole, type Role } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import GroupsBoard from '@/components/GroupsBoard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function hasAccess(role: Role | null | undefined) {
  return role === 'director' || role === 'deputy_plus';
}

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  if (typeof v === 'string' && v.trim() !== '') return v;
  return undefined;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qg = pickStr(sp.qg);
  const qs = pickStr(sp.qs);
  const qu = pickStr(sp.qu);

  const session = await auth();
  const role = normalizeRole((session?.user as any)?.role ?? null);
  if (!hasAccess(role)) redirect('/');

  const [users, groups, subjects] = await Promise.all([
    prisma.user.findMany({
      where: qu
        ? { name: { contains: qu, mode: 'insensitive' } }
        : undefined,
      select: { id: true, name: true, role: true },
      orderBy: [{ name: 'asc' }],
    }),
    prisma.group.findMany({
      where: qg
        ? { name: { contains: qg, mode: 'insensitive' } }
        : undefined,
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }],
    }),
    prisma.subject.findMany({
      where: qs
        ? { name: { contains: qs, mode: 'insensitive' } }
        : undefined,
      select: { id: true, name: true, _count: { select: { members: true } } },
      orderBy: [{ name: 'asc' }],
    }),
  ]);

  const initialSubjects = subjects.map((s) => ({
    id: s.id,
    name: s.name,
    count: s._count.members,
  }));

  return (
    <main style={{ padding: 14 }}>
      <GroupsBoard
        initialUsers={users}
        initialGroups={groups}
        initialSubjects={initialSubjects}
        subjectsEnabled
      />
    </main>
  );
}

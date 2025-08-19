import { auth } from '@/auth.config';
import { normalizeRole } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import CalendarBoard from './CalendarBoard';
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export type TaskLite = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string; // ISO
  priority: 'normal' | 'high' | null;
  hidden: boolean | null;
  createdById: string | null;
  createdByName: string | null;
  myStatus: 'in_progress' | 'done' | null;
};

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function mmddUTC(d: Date) {
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${m}-${dd}`;
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  noStore();
  await searchParams;

  const session = await auth();
  const meId = session?.user?.id ?? '';
  const roleSlug = normalizeRole(session?.user?.role) ?? null;

  if (!meId) {
    return (
      <main style={{ padding: 16 }}>
        <h1 style={{ margin: 0 }}>Календарь</h1>
        <p>Не авторизовано.</p>
      </main>
    );
  }

  // Мои активные задачи
  const raw = await prisma.task.findMany({
    where: { hidden: false, assignees: { some: { userId: meId, status: 'in_progress' } } },
    select: {
      id: true, title: true, description: true, dueDate: true, priority: true, hidden: true,
      createdById: true, createdByName: true,
      assignees: { where: { userId: meId }, select: { status: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  });

  const initialTasks: TaskLite[] = raw.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description,
    dueDate: (t.dueDate as Date).toISOString(),
    priority: (t.priority as 'normal' | 'high' | null) ?? 'normal',
    hidden: !!t.hidden,
    createdById: t.createdById,
    createdByName: t.createdByName,
    myStatus: (t.assignees[0]?.status as 'in_progress' | 'done' | undefined) ?? null,
  }));

  const grouped: Record<string, TaskLite[]> = {};
  for (const t of initialTasks) {
    const key = ymd(new Date(t.dueDate));
    (grouped[key] ||= []).push(t);
  }

  // ДР: БЕРЁМ ВСЕХ пользователей с birthday != null (без фильтра по роли)
  const usersWithBirthday = await prisma.user.findMany({
    where: { birthday: { not: null } },
    select: { name: true, birthday: true },
  });

  // Карта MM-DD (UTC) → список имён
  const birthdaysMap: Record<string, string[]> = {};
  for (const u of usersWithBirthday) {
    const d = u.birthday as Date;
    const key = mmddUTC(d);
    (birthdaysMap[key] ||= []).push((u.name ?? 'Без имени').trim());
  }

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Календарь</h1>
      </header>

      <CalendarBoard
        meId={meId}
        roleSlug={roleSlug}
        initialTasks={initialTasks}
        initialGrouped={grouped}
        birthdaysMap={birthdaysMap}  // ← передаём в клиент
      />
    </main>
  );
}

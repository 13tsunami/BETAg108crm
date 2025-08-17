import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole } from '@/lib/roles';
import CalendarBoard from './CalendarBoard';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type TaskDTO = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;          // ISO
  hidden: boolean;
  priority: 'normal' | 'high';
  createdById: string | null;
  createdByName: string | null;
  assignees: Array<{
    id: string;
    userId: string;
    status: 'in_progress' | 'done';
    completedAt: string | null;
    user?: { id: string; name: string | null } | null;
  }>;
};

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  await searchParams; // контракт Next

  const session = await auth();
  const meId = session?.user?.id ?? '';
  const norm = normalizeRole(session?.user?.role);
  const roleStr = norm ? String(norm) : null;

  const canSeeAll =
    roleStr === 'director' || roleStr === 'deputy_plus' || roleStr === 'Директор' || roleStr === 'Заместитель +';

  // Грузим ВСЕ видимые задачи (не скрытые), чтобы клиент мог фильтровать «мои/все»
  const tasksRaw = await prisma.task.findMany({
    where: { hidden: false },
    include: {
      assignees: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  });

  const tasks: TaskDTO[] = tasksRaw.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description,
    dueDate: t.dueDate.toISOString(),
    hidden: !!t.hidden,
    priority: (t.priority === 'high' ? 'high' : 'normal') as 'normal' | 'high',
    createdById: t.createdById,
    createdByName: t.createdByName,
    assignees: t.assignees.map(a => ({
      id: a.id,
      userId: a.userId,
      status: (a.status === 'done' ? 'done' : 'in_progress') as 'in_progress' | 'done',
      completedAt: a.completedAt ? a.completedAt.toISOString() : null,
      user: a.user ? { id: a.user.id, name: a.user.name } : null,
    })),
  }));

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Календарь</h1>
      </header>

      <CalendarBoard
        meId={meId}
        roleCanSeeAll={canSeeAll}
        initialTasks={tasks}
      />
    </main>
  );
}

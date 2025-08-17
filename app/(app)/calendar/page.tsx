import { auth } from '@/auth.config';
import { normalizeRole } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import CalendarBoard from './CalendarBoard';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await searchParams; // контракт Next 15

  const session = await auth();
  const meId = session?.user?.id ?? '';
  const roleSlug = normalizeRole(session?.user?.role) ?? null;

  // Грузим задачи на сервере (без API).
  // В календаре не показываем скрытые: hidden === true исключаем сразу.
  const tasks = await prisma.task.findMany({
    where: { hidden: false },
    include: {
      assignees: true, // { id, taskId, userId, status, assignedAt, completedAt }
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  });

  // Сделаем сериализацию для RSC
  const initialTasks = tasks.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description,
    dueDate: t.dueDate,
    hidden: t.hidden ?? false,
    priority: (t.priority as 'normal' | 'high' | null) ?? 'normal',
    createdById: t.createdById,
    createdByName: t.createdByName,
    assignees: t.assignees.map(a => ({
      id: a.id,
      taskId: a.taskId,
      userId: a.userId,
      status: a.status as 'in_progress' | 'done',
      assignedAt: a.assignedAt,
      completedAt: a.completedAt,
    })),
  }));

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Календарь</h1>
      </header>

      {/* Клиентский компонент. Теперь даём ему initialTasks вместо fetch. */}
      <CalendarBoard meId={meId} roleSlug={roleSlug} initialTasks={initialTasks} />
    </main>
  );
}

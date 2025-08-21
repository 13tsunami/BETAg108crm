import { prisma } from '@/lib/prisma';
import type { DayPoint, TodaySlice, Priorities, WeekdayLoad, Analytics } from './types';

type Options = {
  meId: string | null;
  rangeDays: number;
  tz: string;
};

export async function getAnalytics(opts: Options): Promise<Analytics> {
  const { meId, rangeDays } = opts;

  const whereBase = meId ? { createdById: meId } : {};

  const tasks = await prisma.task.findMany({
    where: whereBase,
    select: {
      id: true,
      title: true,
      description: true,
      priority: true,
      hidden: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
      createdByName: true,
      assignees: {
        select: {
          status: true,
          completedAt: true,
        },
      },
    },
  });

  const createdDoneMap = new Map<string, { created: number; done: number }>();
  const priorities: Priorities = { high: 0, normal: 0 };
  const today: TodaySlice = { today: 0, overdue: 0, upcoming: 0 };
  const weekday: WeekdayLoad[] = Array.from({ length: 7 }, (_, i) => ({ dow: i, count: 0 }));

  const todayStr = new Date().toISOString().slice(0, 10);

  for (const t of tasks) {
    const dayKey = t.createdAt.toISOString().slice(0, 10);
    const bucket = createdDoneMap.get(dayKey) ?? { created: 0, done: 0 };
    bucket.created += 1;

    const isDone = Array.isArray(t.assignees) && t.assignees.some(a => a.status === 'done' || !!a.completedAt);
    if (isDone) bucket.done += 1;

    createdDoneMap.set(dayKey, bucket);

    if (t.priority === 'high') priorities.high += 1;
    else priorities.normal += 1;

    const dueStr = t.dueDate?.toISOString().slice(0, 10) ?? todayStr;
    if (dueStr === todayStr) today.today += 1;
    else if (dueStr < todayStr) today.overdue += 1;
    else today.upcoming += 1;

    const jsDow = t.dueDate ? t.dueDate.getDay() : new Date().getDay(); // 0=вс
    const idx = jsDow === 0 ? 6 : jsDow - 1; // пн=0 … вс=6
    weekday[idx].count += 1;
  }

  let createdDone: DayPoint[] = Array.from(createdDoneMap.entries())
    .map(([d, v]) => ({ d, created: v.created, done: v.done }))
    .sort((a, b) => a.d.localeCompare(b.d));

  if (Number.isFinite(rangeDays) && rangeDays > 0) {
    createdDone = createdDone.slice(-rangeDays);
  }

  return { createdDone, priorities, today, weekday };
}

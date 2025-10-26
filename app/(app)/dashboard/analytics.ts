// app/(app)/dashboard/analytics.ts
'use server';

import { prisma } from '@/lib/prisma';
import type {
  Analytics,
  SeriesPoint,
  TodayStats,
  WeekdayItem,
  RequestsSla,
  Scope,
} from './types';

type GetAnalyticsArgs = {
  meId: string | null;
  rangeDays: number;        // <-- теперь number
  tz: string;
  scope: Scope;             // 'me' — персонально, 'all' — по всем
};

function ymdTZ(dt: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(dt);
}
function todayRange(tz: string, now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now).split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const end   = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
  return { start, end };
}
function lastNDaysRange(days: number, tz: string, now = new Date()) {
  const { start: todayStart } = todayRange(tz, now);
  const start = new Date(todayStart); start.setUTCDate(start.getUTCDate() - (days - 1));
  const end   = new Date(todayStart); end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}
function weekdayTZ(dt: Date, tz: string): 1|2|3|4|5|6|7 {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(dt);
  return w === 'Mon' ? 1 : w === 'Tue' ? 2 : w === 'Wed' ? 3 : w === 'Thu' ? 4 : w === 'Fri' ? 5 : w === 'Sat' ? 6 : 7;
}

/**
 * scope='me' — серия по моим назначениям (assignedAt/completedAt userId=meId).
 * scope='all' — по всем назначениям. «Сегодня» и «Нагрузка» тоже учитывают scope.
 * SLA и «ожидают проверки» — общешкольные.
 */
export async function getAnalytics({ meId, rangeDays, tz, scope }: GetAnalyticsArgs): Promise<Analytics> {
  // нормализация произвольного number к 1|7|14|30
  const allowed = [1, 7, 14, 30] as const;
  const safeDays: (typeof allowed)[number] =
    (allowed as readonly number[]).includes(rangeDays) ? (rangeDays as any) : 14;

  const { start: s, end: e } = lastNDaysRange(safeDays, tz);

  // --- 1) Серия "создано/выполнено"
  let createdVsDone: SeriesPoint[];
  if (scope === 'me' && meId) {
    const [assigned, doneMine] = await Promise.all([
      prisma.taskAssignee.findMany({
        where: { userId: meId, assignedAt: { gte: s, lt: e } },
        select: { assignedAt: true },
      }),
      prisma.taskAssignee.findMany({
        where: { userId: meId, completedAt: { gte: s, lt: e } },
        select: { completedAt: true },
      }),
    ]);
    const map = new Map<string, { created: number; done: number }>();
    for (let i = 0; i < safeDays; i++) {
      const d = new Date(s); d.setUTCDate(d.getUTCDate() + i);
      map.set(ymdTZ(d, tz), { created: 0, done: 0 });
    }
    for (const a of assigned) { const k = ymdTZ(a.assignedAt, tz); const v = map.get(k)!; v.created++; }
    for (const d of doneMine) { const k = ymdTZ(d.completedAt!, tz); const v = map.get(k)!; v.done++; }
    createdVsDone = Array.from(map.entries()).map(([day, v]) => ({ day, ...v }));
  } else {
    const [assigned, doneAll] = await Promise.all([
      prisma.taskAssignee.findMany({ where: { assignedAt: { gte: s, lt: e } }, select: { assignedAt: true } }),
      prisma.taskAssignee.findMany({ where: { completedAt: { gte: s, lt: e } }, select: { completedAt: true } }),
    ]);
    const map = new Map<string, { created: number; done: number }>();
    for (let i = 0; i < safeDays; i++) {
      const d = new Date(s); d.setUTCDate(d.getUTCDate() + i);
      map.set(ymdTZ(d, tz), { created: 0, done: 0 });
    }
    for (const a of assigned) { const k = ymdTZ(a.assignedAt, tz); const v = map.get(k)!; v.created++; }
    for (const d of doneAll)  { const k = ymdTZ(d.completedAt!, tz); const v = map.get(k)!; v.done++; }
    createdVsDone = Array.from(map.entries()).map(([day, v]) => ({ day, ...v }));
  }

  // --- 2) Сегодня (персонально/общий)
  const { start: tStart, end: tEnd } = todayRange(tz);
  const whereAssignee = scope === 'me' && meId ? { userId: meId } : {};
  const [dueToday, overdue, completedToday, totalAssigned] = await Promise.all([
    prisma.taskAssignee.count({ where: { ...whereAssignee, task: { hidden: false, dueDate: { gte: tStart, lt: tEnd } } } }),
    prisma.taskAssignee.count({
      where: {
        ...whereAssignee,
        status: { in: ['in_progress', 'submitted'] },
        task: { hidden: false, dueDate: { lt: tStart } },
      },
    }),
    prisma.taskAssignee.count({ where: { ...whereAssignee, completedAt: { gte: tStart, lt: tEnd } } }),
    prisma.taskAssignee.count({ where: { ...whereAssignee, task: { hidden: false } } }),
  ]);
  const today: TodayStats = { totalAssigned, dueToday, overdue, completedToday };

  // --- 3) Нагрузка по дням недели
  const { start: wStart, end: wEnd } = lastNDaysRange(56, tz);
  const buckets = new Array<number>(7).fill(0);
  if (scope === 'me' && meId) {
    const myDue = await prisma.taskAssignee.findMany({
      where: { userId: meId, task: { hidden: false, dueDate: { gte: wStart, lt: wEnd } } },
      select: { task: { select: { dueDate: true } } },
    });
    for (const a of myDue) {
      const wd = weekdayTZ(a.task!.dueDate, tz); buckets[wd - 1] = (buckets[wd - 1] ?? 0) + 1;
    }
  } else {
    const dueInWindow = await prisma.task.findMany({
      where: { hidden: false, dueDate: { gte: wStart, lt: wEnd } },
      select: { dueDate: true },
    });
    for (const t of dueInWindow) {
      const wd = weekdayTZ(t.dueDate, tz); buckets[wd - 1] = (buckets[wd - 1] ?? 0) + 1;
    }
  }
  const loadByWeekday: WeekdayItem[] = buckets.map((count, i) => ({ weekday: (i + 1) as WeekdayItem['weekday'], count }));

  // --- 4) Ожидают проверки — всегда по всем
  const pendingForReview = await prisma.taskAssignee.count({ where: { status: 'submitted' } });

  // --- 5) SLA заявок — всегда по всем
  const req = await prisma.request.findMany({
    where: { createdAt: { gte: wStart, lt: wEnd } },
    select: { createdAt: true, closedAt: true, status: true },
  });
  const open = req.filter(r => r.status !== 'done' && r.status !== 'rejected').length;
  const durations: number[] = [];
  let done24h = 0;
  for (const r of req) {
    if (r.closedAt) {
      const hrs = (r.closedAt.getTime() - r.createdAt.getTime()) / 36e5;
      durations.push(hrs);
      if (hrs <= 24) done24h++;
    }
  }
  durations.sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : 0;
  const requestsSla: RequestsSla = { open, done24h, medianHours: Math.round(median * 10) / 10 };

  return { createdVsDone, today, loadByWeekday, pendingForReview, requestsSla };
}

// app/(app)/dashboard/weekly.ts
'use server';

import { prisma } from '@/lib/prisma';
import type { WeeklyReport, Scope } from './types';

type Args = { meId: string | null; tz: string; scope: Scope };

function todayRange(tz: string, now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now).split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const end   = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
  return { start, end };
}
function last7(tz: string, now = new Date()) {
  const { start: todayStart } = todayRange(tz, now);
  const start = new Date(todayStart); start.setUTCDate(start.getUTCDate() - 6);
  const end   = new Date(todayStart); end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}
function ymdTZ(dt: Date, tz: string) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: tz, year: '2-digit', month: '2-digit', day: '2-digit' }).format(dt);
}

export async function getWeeklyReport({ meId, tz, scope }: Args): Promise<WeeklyReport> {
  const { start, end } = last7(tz);
  const whereUser = scope === 'me' && meId ? { userId: meId } : {};

  const done = await prisma.taskAssignee.findMany({
    where: { ...whereUser, completedAt: { gte: start, lt: end } },
    select: {
      assignedAt: true,
      completedAt: true,
      task: { select: { dueDate: true, hidden: true } },
    },
  });

  const doneCount7d = done.length;

  const deltasH: number[] = [];
  let late = 0;
  const mapDone = new Map<string, number>();
  const mapLate = new Map<string, number>();

  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setUTCDate(d.getUTCDate() + i);
    mapDone.set(ymdTZ(d, tz), 0);
    mapLate.set(ymdTZ(d, tz), 0);
  }

  for (const a of done) {
    const k = ymdTZ(a.completedAt!, tz);
    mapDone.set(k, (mapDone.get(k) ?? 0) + 1);

    const hrs = (a.completedAt!.getTime() - a.assignedAt.getTime()) / 36e5;
    deltasH.push(hrs);

    if (!a.task?.hidden && a.task!.dueDate < a.completedAt!) {
      late++; mapLate.set(k, (mapLate.get(k) ?? 0) + 1);
    }
  }

  deltasH.sort((x,y)=>x-y);
  const avgHoursToComplete7d = deltasH.length ? Math.round((deltasH.reduce((s,x)=>s+x,0)/deltasH.length)*10)/10 : 0;
  const lateRate7d = doneCount7d ? late / doneCount7d : 0;

  return {
    doneCount7d,
    lateRate7d,
    avgHoursToComplete7d,
    seriesDone7d: Array.from(mapDone.entries()).map(([day, done]) => ({ day, done })),
    seriesLate7d: Array.from(mapLate.entries()).map(([day, late]) => ({ day, late })),
  };
}

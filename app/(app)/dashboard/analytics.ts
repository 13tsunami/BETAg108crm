// Серверные расчёты под Ваше ТЗ
import { prisma } from '@/lib/prisma';
import type { Analytics, DayPoint, TodaySlice, WeekdayLoad } from './types';

type Options = {
  meId: string | null;
  rangeDays: number;   // для обрезки хвоста линии created/done
  tz: string;          // напр. 'Asia/Yekaterinburg'
};

function ymdInTz(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const dd = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${dd}`;
}

// 0..6 для пн..вс в целевой TZ
function dowInTz(d: Date, timeZone: string): number {
  const ymd = ymdInTz(d, timeZone);              // «полночь» того дня в TZ
  const pivot = new Date(`${ymd}T00:00:00Z`);    // UTC-вью
  const js = pivot.getUTCDay();                  // 0..6 (вс..сб)
  return js === 0 ? 6 : js - 1;                  // 0..6 (пн..вс)
}

export async function getAnalytics(opts: Options): Promise<Analytics> {
  const meId = opts.meId ?? null;
  const tz = opts.tz || 'Asia/Yekaterinburg';
  const rangeDays = Number.isFinite(opts.rangeDays) && opts.rangeDays > 0 ? opts.rangeDays : 14;

  if (!meId) {
    return {
      createdDone: [],
      today: { today: 0, overdue: 0, upcoming: 0 },
      weekday: Array.from({ length: 7 }, (_, i) => ({ dow: i, count: 0 })),
    };
  }

  // «Создано»: я — автор
  const createdByMe = await prisma.task.findMany({
    where: { createdById: meId },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  // Мои назначения (для done/today/weekday)
  const myAssigned = await prisma.task.findMany({
    where: { assignees: { some: { userId: meId } } },
    select: {
      id: true,
      dueDate: true,
      updatedAt: true,
      assignees: {
        where: { userId: meId },
        select: { status: true, completedAt: true },
      },
    },
    orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
  });

  // «Выполнено»: только где мой статус = done; дата — completedAt (fallback updatedAt)
  const myDoneOnly = myAssigned
    .map(t => {
      const a = t.assignees[0];
      if (!a || a.status !== 'done') return null;
      return { id: t.id, when: (a.completedAt ?? t.updatedAt) as Date };
    })
    .filter(Boolean) as { id: string; when: Date }[];

  // Агрегация created/done по дням (в TZ)
  const perDay = new Map<string, { created: number; done: number }>();
  for (const t of createdByMe) {
    const key = ymdInTz(t.createdAt as Date, tz);
    const cell = perDay.get(key) ?? { created: 0, done: 0 };
    cell.created += 1;
    perDay.set(key, cell);
  }
  for (const t of myDoneOnly) {
    const key = ymdInTz(t.when, tz);
    const cell = perDay.get(key) ?? { created: 0, done: 0 };
    cell.done += 1;
    perDay.set(key, cell);
  }

  let createdDone: DayPoint[] = Array.from(perDay.entries())
    .map(([d, v]) => ({ d, created: v.created, done: v.done }))
    .sort((a, b) => a.d.localeCompare(b.d));
  if (createdDone.length > rangeDays) {
    createdDone = createdDone.slice(-rangeDays);
  }

  // Срез «Сегодня / Просрочено / Ожидает» и «Нагрузка» — только мои активные (in_progress)
  const todayYmd = ymdInTz(new Date(), tz);
  const today: TodaySlice = { today: 0, overdue: 0, upcoming: 0 };
  const weekday: WeekdayLoad = Array.from({ length: 7 }, (_, i) => ({ dow: i, count: 0 }));

  for (const t of myAssigned) {
    const mine = t.assignees[0];
    if (!mine || mine.status !== 'in_progress') continue;

    const dueY = ymdInTz(t.dueDate as Date, tz);
    if (dueY === todayYmd) today.today += 1;
    else if (dueY < todayYmd) today.overdue += 1;
    else today.upcoming += 1;

    const idx = dowInTz(t.dueDate as Date, tz);
    weekday[idx].count += 1;
  }

  return { createdDone, today, weekday };
}

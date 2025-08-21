import { auth } from '@/auth.config';
import { normalizeRole } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import CalendarBoard from './CalendarBoard';
import { unstable_noStore as noStore } from 'next/cache';
import NewNoteButton from './NewNoteButton';
import CalendarModals from './CalendarModals';

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

export type NoteLite = {
  id: string;
  at: string;       // ISO
  allDay: boolean;
  title: string | null;
  text: string;     // усечённая для плитки версия
};

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function mmddInTz(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('ru-RU', { timeZone, month: '2-digit', day: '2-digit' }).formatToParts(d);
  const m = parts.find(p => p.type === 'month')!.value;
  const dd = parts.find(p => p.type === 'day')!.value;
  return `${m}-${dd}`;
}
function currentYearMonthInTz(timeZone: string): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const y = Number(parts.find(p => p.type === 'year')!.value);
  const m = Number(parts.find(p => p.type === 'month')!.value);
  return { year: y, month: m };
}
function parseMonthParam(mParam: string | string[] | undefined, timeZone: string): { year: number; month: number } {
  const raw = Array.isArray(mParam) ? mParam[0] : mParam;
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split('-').map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  return currentYearMonthInTz(timeZone);
}

// новая функция: берем диапазон ±2 месяца вокруг выбранного месяца
function aroundMonthUtcRange(year: number, month1to12: number, tzOffsetMinutes: number): { startUTC: Date; endUTC: Date } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const offSign = tzOffsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(tzOffsetMinutes);
  const offHH = pad(Math.floor(abs / 60));
  const offMM = pad(abs % 60);
  const offset = `${offSign}${offHH}:${offMM}`;

  // старт: два месяца ДО выбранного
  const startMonthIndex = month1to12 - 2;
  const startYear = startMonthIndex <= 0 ? year - 1 : year;
  const startMonth = startMonthIndex <= 0 ? 12 + startMonthIndex : startMonthIndex;

  // конец: начало месяца, который на три месяца ПОСЛЕ выбранного
  const endMonthIndex = month1to12 + 3;
  const endYear = endMonthIndex > 12 ? year + 1 : year;
  const endMonth = endMonthIndex > 12 ? endMonthIndex - 12 : endMonthIndex;

  const startIsoLocal = `${startYear}-${pad(startMonth)}-01T00:00:00${offset}`;
  const endIsoLocal   = `${endYear}-${pad(endMonth)}-01T00:00:00${offset}`;

  const startUTC = new Date(startIsoLocal);
  const endUTC = new Date(new Date(endIsoLocal).getTime() - 1);

  return { startUTC, endUTC };
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  noStore();

  const sp = await searchParams;
  const TZ = 'Asia/Yekaterinburg';
  const { year, month } = parseMonthParam(sp.m, TZ);
  const { startUTC, endUTC } = aroundMonthUtcRange(year, month, 5 * 60);

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

  const rawTasks = await prisma.task.findMany({
    where: {
      hidden: false,
      assignees: { some: { userId: meId, status: 'in_progress' } },
      dueDate: { gte: startUTC, lte: endUTC },
    },
    select: {
      id: true, title: true, description: true, dueDate: true, priority: true, hidden: true,
      createdById: true, createdByName: true,
      assignees: { where: { userId: meId }, select: { status: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  });

  const initialTasks: TaskLite[] = rawTasks.map(t => ({
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

  const usersWithBirthday = await prisma.user.findMany({
    where: { birthday: { not: null } },
    select: { name: true, birthday: true },
  });

  const birthdaysMap: Record<string, string[]> = {};
  for (const u of usersWithBirthday) {
    const d = u.birthday as Date;
    const key = mmddInTz(d, TZ);
    (birthdaysMap[key] ||= []).push((u.name ?? 'Без имени').trim());
  }

  const notesRaw = await prisma.note.findMany({
    where: { userId: meId, at: { gte: startUTC, lte: endUTC } },
    select: { id: true, at: true, allDay: true, title: true, text: true },
    orderBy: [{ at: 'asc' }, { id: 'asc' }],
  });

  const initialNotes: NoteLite[] = notesRaw.map(n => ({
    id: n.id,
    at: (n.at as Date).toISOString(),
    allDay: !!n.allDay,
    title: n.title ?? null,
    text: truncateForTile(n.text ?? ''),
  }));

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Календарь</h1>
        <NewNoteButton />
      </header>

      <CalendarBoard
        meId={meId}
        roleSlug={roleSlug}
        initialTasks={initialTasks}
        initialGrouped={grouped}
        birthdaysMap={birthdaysMap}
        initialNotes={initialNotes}
      />

      <CalendarModals tasks={initialTasks as any} meId={meId} notes={initialNotes} />
    </main>
  );
}

function truncateForTile(s: string): string {
  const max = 180;
  const clean = s.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + '…';
}

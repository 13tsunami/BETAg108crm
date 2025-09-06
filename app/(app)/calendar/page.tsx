// app/(app)/calendar/page.tsx
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

export type AttachmentLite = {
  id: string;
  name: string;
  originalName: string | null;
  mime: string;
  size: number;
};

export type AssigneeLite = { id: string; name: string | null };

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

  // новое
  attachments: AttachmentLite[];
  assignees: AssigneeLite[];
};

export type NoteLite = {
  id: string;
  at: string;       // ISO
  allDay: boolean;
  title: string | null;
  text: string;     // полный текст (без усечения)
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

// диапазон ±2 месяца вокруг выбранного
function aroundMonthUtcRange(year: number, month1to12: number, tzOffsetMinutes: number): { startUTC: Date; endUTC: Date } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const offSign = tzOffsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(tzOffsetMinutes);
  const offHH = pad(Math.floor(abs / 60));
  const offMM = pad(abs % 60);
  const offset = `${offSign}${offHH}:${offMM}`;

  const startMonthIndex = month1to12 - 2;
  const startYear = startMonthIndex <= 0 ? year - 1 : year;
  const startMonth = startMonthIndex <= 0 ? 12 + startMonthIndex : startMonthIndex;

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

      // кому назначено
      assignees: {
        select: {
          user: { select: { id: true, name: true } },
          status: true,
        }
      },

      // вложения задачи
      attachments: {
        select: {
          attachment: {
            select: { id: true, name: true, originalName: true, mime: true, size: true }
          }
        }
      },
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

    assignees: t.assignees.map(a => ({ id: a.user.id, name: a.user.name })),
    attachments: t.attachments.map(x => ({
      id: x.attachment.id,
      name: x.attachment.name,
      originalName: x.attachment.originalName ?? null,
      mime: x.attachment.mime,
      size: x.attachment.size,
    })),
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
    text: n.text ?? '',
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

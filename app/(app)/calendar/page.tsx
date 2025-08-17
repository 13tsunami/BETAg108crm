// app/(app)/calendar/page.tsx
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks } from '@/lib/roles';
import type { Prisma } from '@prisma/client';
import CalendarBoard from './CalendarBoard';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type TaskWithAssignees = Prisma.TaskGetPayload<{ include: { assignees: true } }>;

const YEKAT = 'Asia/Yekaterinburg';

// aux: YYYY-MM-DD (в Екб) -> UTC Date 00:00 Екб
function ymdStartUtcFromYekb(ymd: string): Date {
  const local = new Date(`${ymd}T00:00:00+05:00`);
  return new Date(local.toISOString());
}
function startOfWeekYekbFromYmd(ymd: string): Date {
  const startLocal = new Date(`${ymd}T00:00:00+05:00`);
  const wd = (startLocal.getUTCDay() + 6) % 7; // 0 = Mon
  startLocal.setUTCDate(startLocal.getUTCDate() - wd);
  return new Date(startLocal.toISOString());
}
function startOfMonthYekbFromYmd(ymd: string): Date {
  const [y, m] = ymd.split('-').map(Number);
  const local = new Date(`${y}-${String(m).padStart(2,'0')}-01T00:00:00+05:00`);
  return new Date(local.toISOString());
}
function addDaysUtc(d: Date, days: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}
function addMonthsFromYekbStart(monthStartUtc: Date, n: number) {
  const iso = monthStartUtc.toISOString().slice(0,10);
  const local = new Date(`${iso}T00:00:00+05:00`);
  local.setUTCMonth(local.getUTCMonth() + n);
  return new Date(local.toISOString());
}
function todayYekbYmd(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: YEKAT, year:'numeric', month:'2-digit', day:'2-digit' });
  return fmt.format(new Date()); // YYYY-MM-DD
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  const session = await auth();
  const meId = session?.user?.id ?? '';
  const role = normalizeRole(session?.user?.role) ?? null;

  // query: view, mode, cursor (YYYY-MM-DD в Екб)
  const view = (typeof sp.view === 'string' && (sp.view === 'month' || sp.view === 'week')) ? sp.view : 'week';

  // ВАЖНО: вместо строк сравниваем бизнес-право.
  // Если пользователь НЕ может создавать задачи — это teacher-подобная роль → дефолт "mine".
  const defaultMode: 'mine' | 'all' = canCreateTasks(role) ? 'all' : 'mine';
  const mode = (typeof sp.mode === 'string' && (sp.mode === 'mine' || sp.mode === 'all')) ? sp.mode : defaultMode;

  const cursorYmd = typeof sp.cursor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.cursor)
    ? sp.cursor
    : todayYekbYmd();

  // Диапазон по Екб -> UTC
  const rangeStartUtc = view === 'week'
    ? startOfWeekYekbFromYmd(cursorYmd)
    : startOfMonthYekbFromYmd(cursorYmd);

  const rangeEndUtc = view === 'week'
    ? addDaysUtc(rangeStartUtc, 7)
    : addMonthsFromYekbStart(rangeStartUtc, 1);

  // Выборка задач (только не скрытые)
  const whereBase: Prisma.TaskWhereInput = {
    hidden: false,
    dueDate: { gte: rangeStartUtc, lt: rangeEndUtc },
  };
  const where: Prisma.TaskWhereInput =
    mode === 'mine'
      ? {
          ...whereBase,
          assignees: { some: { userId: meId } }, // только мои назначения
        }
      : whereBase;

  const tasks: TaskWithAssignees[] = await prisma.task.findMany({
    where,
    include: { assignees: true },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  });

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Календарь</h1>
      </header>

      <CalendarBoard
        meId={meId}
        roleSlug={role}
        view={view}
        mode={mode}
        cursorYmd={cursorYmd}
        tasks={tasks}
      />
    </main>
  );
}

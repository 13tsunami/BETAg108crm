'use client';

import React from 'react';
import Link from 'next/link';
import TaskPopover from '@/components/TaskPopover';

// ===== Типы =====
type TaskAssignee = { userId?: string; status?: string | null; user?: { id: string } | null };
type Task = {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;                  // ISO
  priority?: 'high' | 'normal' | string | null;
  hidden?: boolean | null;                  // если true — не показывать в календаре
  createdById?: string | null;
  seq?: number | null;
  assignees?: TaskAssignee[];
};
type SimpleUser = { id: string; name: string | null; role?: string | null; roleSlug?: string | null };

type Props = {
  meId: string;
  initialUsers?: SimpleUser[];
};

// ===== Палитра =====
const BRAND = '#8d2828';
const BORDER = '#e5e7eb';
const TEXT_1 = '#111827';
const TEXT_2 = '#6b7280';
const BG = '#ffffff';
const BG_SOFT = '#fafafa';
const BG_TODAY = '#fff5f5';
const BG_SELECTED = '#fff9f5';
const BG_WEEKEND = '#fcfcff';
const OK = '#22c55e';

// ===== Хелперы дат/сортировки =====
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function ymd(d: Date) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const iso = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString();
  return iso.slice(0, 10);
}
function ruMonthYear(d: Date) {
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}
function ruDayMonth(d: Date) {
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
function mondayOf(dateISO: string) {
  const d = new Date(dateISO);
  const dow = (d.getDay() + 6) % 7; // Пн=0
  const m = new Date(d);
  m.setDate(d.getDate() - dow);
  return m;
}
function weekCellsByISO(dateISO: string) {
  const monday = mondayOf(dateISO);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return { iso: ymd(x), day: x.getDate(), js: x };
  });
}
function monthCells(year: number, month: number) {
  const start = new Date(year, month, 1);
  const firstDow = (start.getDay() + 6) % 7; // Пн=0
  const days = new Date(year, month + 1, 0).getDate();
  const cells: { iso: string | null; day: number | null; js?: Date }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ iso: null, day: null });
  for (let d = 1; d <= days; d++) {
    const cur = new Date(year, month, d);
    cells.push({ iso: ymd(cur), day: d, js: cur });
  }
  while (cells.length % 7) cells.push({ iso: null, day: null });
  return cells;
}
function toYMDFromISO(dt?: string | null) {
  if (!dt) return null;
  try { return ymd(new Date(dt)); } catch { return null; }
}
function weekRangeLabel(dateISO: string) {
  const s = mondayOf(dateISO);
  const e = new Date(s); e.setDate(s.getDate() + 6);
  if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} ${ruMonthYear(e)}`;
  return `${ruDayMonth(s)} — ${ruDayMonth(e)} ${e.getFullYear()}`;
}
function orderKey(t: Task) {
  const pr = t.priority === 'high' ? 0 : 1;
  const seq = t.seq ?? Number.MAX_SAFE_INTEGER;
  const id = t.id || '';
  return { pr, seq, id };
}
function assigneeIds(t: Task): string[] {
  const out = new Set<string>();
  if (Array.isArray(t.assignees)) {
    for (const a of t.assignees) {
      const uid = a.userId ?? a.user?.id;
      if (uid) out.add(String(uid));
    }
  }
  return Array.from(out);
}
function isDoneByViewer(t: Task, meId?: string) {
  if (!meId || !Array.isArray(t.assignees)) return false;
  const me = t.assignees.find(a => (a.userId ?? a.user?.id) === meId);
  return !!me && me.status === 'done';
}

function byDayMap(tasks: Task[]) {
  const m = new Map<string, Task[]>();
  for (const t of tasks) {
    const day = toYMDFromISO(t.dueDate);
    if (!day) continue;
    const list = m.get(day) ?? [];
    list.push(t);
    m.set(day, list);
  }
  for (const [k, list] of m) {
    list.sort((a, b) => {
      const A = orderKey(a); const B = orderKey(b);
      if (A.pr !== B.pr) return A.pr - B.pr;
      if (A.seq !== B.seq) return A.seq - B.seq;
      return A.id.localeCompare(B.id);
    });
  }
  return m;
}

// ===== Компонент =====
export default function CalendarBoard({ meId, initialUsers = [] }: Props) {
  const [users, setUsers] = React.useState<SimpleUser[]>(initialUsers);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/users', { cache: 'no-store' });
        const j = r.ok ? (await r.json()) as SimpleUser[] : [];
        if (alive) setUsers(Array.isArray(j) ? j : []);
      } catch {
        if (alive) setUsers([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  const [view, setView] = React.useState<'week' | 'month'>('week');
  const [cursor, setCursor] = React.useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = React.useState(ymd(new Date()));
  const [q, setQ] = React.useState('');
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [reload, setReload] = React.useState(0);

  // Поповер
  const [popover, setPopover] = React.useState<{ open: boolean; task?: Task | null; anchor?: DOMRect | null }>(
    { open: false, task: null, anchor: null }
  );
  function openTaskPopover(e: React.MouseEvent, t: Task) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopover({ open: true, task: t, anchor: rect });
  }
  function closePopover() { setPopover({ open: false, task: null, anchor: null }); }

  React.useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') closePopover(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Загрузка задач
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/tasks', { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const arr = (await r.json()) as Task[];
        if (!alive) return;
        const normalized = (Array.isArray(arr) ? arr : []).map((t) => ({
          ...t,
          priority: (t.priority === 'high' ? 'high' : 'normal') as 'high' | 'normal',
          hidden: !!t.hidden,
        }));
        setTasks(normalized);
      } catch {
        if (alive) setTasks([]);
      }
    })();
    return () => { alive = false; };
  }, [reload]);

  // Фильтрация: календарь показывает только задачи с датой и не скрытые.
  const filtered = React.useMemo(() => {
    const base = tasks.filter(t => !t.hidden && !!t.dueDate); // уважение чекбокса «не размещать в календаре»
    const qq = q.trim().toLowerCase();
    if (!qq) return base;
    return base.filter(t => (t.title ?? '').toLowerCase().includes(qq) || (t.description ?? '').toLowerCase().includes(qq));
  }, [tasks, q]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const monthGrid = React.useMemo(() => monthCells(year, month), [year, month]);
  const weekGrid  = React.useMemo(() => weekCellsByISO(selectedDate), [selectedDate]);
  const mapByDay  = React.useMemo(() => byDayMap(filtered), [filtered]);

  function shiftLeft() {
    if (view === 'week') {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 7);
      const iso = ymd(d);
      setSelectedDate(iso);
      setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    } else {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
    }
  }
  function shiftRight() {
    if (view === 'week') {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + 7);
      const iso = ymd(d);
      setSelectedDate(iso);
      setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    } else {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
    }
  }

  const headerLabel = view === 'week' ? weekRangeLabel(selectedDate) : ruMonthYear(new Date(year, month, 1));

  return (
    <div style={{ fontFamily: '"Inter", system-ui, -apple-system, Segoe UI, Roboto, Arial', fontSize: 13 }}>
      <style>{`
        .btn { height: 32px; padding: 0 12px; border-radius: 10px; border: 1px solid ${BORDER}; background: #fff; cursor: pointer; }
        .btn-primary { height: 32px; padding: 0 12px; border-radius: 10px; border: 1px solid ${BRAND}; background: ${BRAND}; color: #fff; cursor: pointer; font-weight: 700; }
        .input { height: 32px; padding: 0 10px; border-radius: 10px; border: 1px solid ${BORDER}; outline: none; background: #fff; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <button className="btn" onClick={shiftLeft}>‹</button>
        <div style={{ fontWeight: 800, fontSize: 20 }}>{headerLabel}</div>
        <button className="btn" onClick={shiftRight}>›</button>

        <div style={{ marginLeft: 16, display: 'flex', gap: 6 }}>
          <button className={view === 'week' ? 'btn-primary' : 'btn'} onClick={() => setView('week')}>Неделя</button>
          <button className={view === 'month' ? 'btn-primary' : 'btn'} onClick={() => setView('month')}>Месяц</button>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} className="input" style={{ width: 320 }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, alignItems: 'start' }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ fontWeight: 800, textAlign: 'center', padding: 6, color: TEXT_1 }}>
            {w}
          </div>
        ))}

        {(view === 'week' ? weekGrid : monthGrid).map((c, i) => (
          <DayCell
            key={i}
            iso={c.iso}
            day={c.day}
            jsDate={c.js}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            mapByDay={mapByDay}
            onTaskClick={openTaskPopover}
          />
        ))}
      </div>

      {popover.open && popover.task && (
        <TaskPopover
          anchor={popover.anchor ?? null}
          onClose={closePopover}
          task={popover.task}
          users={users}
          meId={meId}
          brand={BRAND}
          okColor={OK}
          borderColor={BORDER}
          text1={TEXT_1}
          text2={TEXT_2}
          bgSoft={BG_SOFT}
          onMarked={() => setReload(v => v + 1)}
        />
      )}
    </div>
  );
}

function DayCell(props: {
  iso: string | null;
  day: number | null;
  jsDate?: Date;
  selectedDate: string;
  setSelectedDate: React.Dispatch<React.SetStateAction<string>>;
  mapByDay: Map<string, Task[]>;
  onTaskClick: (e: React.MouseEvent, t: Task) => void;
}) {
  const { iso, day, jsDate, selectedDate, setSelectedDate, mapByDay, onTaskClick } = props;
  const todayIso = ymd(new Date());
  const isToday = iso && iso === todayIso;
  const isSelected = iso && iso === selectedDate;
  const isWeekend = jsDate ? [0, 6].includes(jsDate.getDay()) : false;
  const list = (iso ? (mapByDay.get(iso) ?? []) : []) as Task[];

  return (
    <div
      onClick={() => { if (iso) setSelectedDate(iso); }}
      style={{
        border: `1px solid ${isToday ? BRAND : BORDER}`,
        padding: 10,
        background: iso ? (isSelected ? BG_SELECTED : isToday ? BG_TODAY : (isWeekend ? BG_WEEKEND : BG)) : BG,
        borderRadius: 12,
        transition: 'background 120ms ease',
        cursor: iso ? 'pointer' : 'default',
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 14, color: TEXT_2, marginBottom: 6 }}>{day ?? ''}</div>
      <div>
        {list.map((t) => (
          <TaskPill key={t.id} t={t} onClick={onTaskClick} />
        ))}
      </div>
    </div>
  );
}

function TaskPill({ t, onClick }: { t: Task; onClick: (e: React.MouseEvent, t: Task) => void }) {
  const urgent = t.priority === 'high';
  return (
    <button
      type="button"
      onClick={(e) => onClick(e, t)}
      title={t.title}
      style={{
        width: '100%',
        textAlign: 'left',
        border: `1px solid ${urgent ? BRAND : BORDER}`,
        background: urgent ? `${BRAND}0D` : BG_SOFT,
        color: TEXT_1,
        borderRadius: 10,
        padding: '6px 8px',
        fontSize: 13,
        fontWeight: 700,
        marginBottom: 6,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {t.title}
    </button>
  );
}

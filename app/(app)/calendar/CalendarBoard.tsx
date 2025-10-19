/* app/(app)/calendar/CalendarBoard.tsx */
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { TaskLite, NoteLite } from './page';
import Tooltip from '@/components/Tooltip';

type Props = {
  meId: string;
  roleSlug: string | null;
  initialTasks: TaskLite[];
  initialGrouped: Record<string, TaskLite[]>;
  birthdaysMap?: Record<string, string[]>;
  initialNotes?: NoteLite[];
};

const BRAND = '#8d2828';
const BG_MY = '#FEF3C7';
const BD_MY = '#F59E0B';
const URGENT = BRAND;

const ZERO_GRAY = '#9ca3af';
const NOTE_GREEN = '#34D399';
const OVERDUE_RED = '#b91c1c';

/* полупрозрачные фоны-плашки (вариант 3) */
const TASK_BG_SOFT = 'rgba(245, 158, 11, 0.15)';   // amber-500 @ 15%
const NOTE_BG_SOFT = 'rgba(52, 211, 153, 0.15)';   // emerald-400 @ 15%

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/* ===== helpers: даты/время ===== */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function mmdd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${m}-${dd}`;
}
function mmddInTz(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('ru-RU', { timeZone, month: '2-digit', day: '2-digit' }).formatToParts(d);
  const m = parts.find(p => p.type === 'month')!.value;
  const dd = parts.find(p => p.type === 'day')!.value;
  return `${m}-${dd}`;
}
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function fmtRuDateShort(d: Date | string) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Yekaterinburg', day: 'numeric', month: 'long' })
    .format(dt)
    .replace('.', '');
}
function fmtMonthYearRu(d: Date) {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
    .format(d)
    .replace(/^./, s => s.toUpperCase());
}
function isWeekend(d: Date) {
  const wd = d.getDay();
  return wd === 0 || wd === 6;
}
function isRuHoliday(d: Date) {
  const md = mmdd(d);
  return (
    md === '01-01' || md === '01-02' || md === '01-03' || md === '01-04' ||
    md === '01-05' || md === '01-06' || md === '01-07' || md === '01-08' ||
    md === '02-23' || md === '03-08' || md === '05-01' || md === '05-09' ||
    md === '06-12' || md === '11-04'
  );
}

/* ===== доменные предикаты (без any) ===== */
type UnknownRec = Record<string, unknown>;

function hasTruthy(obj: unknown, key: string): boolean {
  if (!obj || typeof obj !== 'object') return false;
  return Boolean((obj as UnknownRec)[key]);
}
function hasEquals(obj: unknown, key: string, expected: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  return (obj as UnknownRec)[key] === expected;
}

function isArchivedTask(t: TaskLite): boolean {
  return (
    hasTruthy(t, 'archived') ||
    hasTruthy(t, 'archivedAt') ||
    hasTruthy(t, 'isArchived') ||
    hasEquals(t, 'status', 'archived')
  );
}
function isArchivedNote(n: NoteLite): boolean {
  return (
    hasTruthy(n, 'archived') ||
    hasTruthy(n, 'archivedAt') ||
    hasTruthy(n, 'isArchived') ||
    hasEquals(n, 'status', 'archived')
  );
}

/* дедлайн-момент с учётом времени; если дата без времени — конец дня UTC+5 */
const EKAT_OFFSET = '+05:00';
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function deadlineFrom(val: string | Date): Date {
  if (val instanceof Date) return val;
  if (ISO_DATE_ONLY.test(val)) return new Date(`${val}T23:59:59.999${EKAT_OFFSET}`);
  return new Date(val);
}
function nowEkaterinburg(): Date {
  return new Date();
}

type UnionItem =
  | { kind: 'task'; t: TaskLite }
  | { kind: 'note'; n: NoteLite };

export default function CalendarBoard({
  meId,
  roleSlug,
  initialTasks,
  initialGrouped: _initialGrouped,
  birthdaysMap,
  initialNotes,
}: Props) {
  const [view, setView] = useState<'week' | 'month'>('month');
  const [cursor, setCursor] = useState<Date>(startOfWeek(new Date()));
  const [tasks, setTasks] = useState<TaskLite[]>(initialTasks);
  const [expandedSixth, setExpandedSixth] = useState(false);

  const dayJustOpenedAt = useRef<number>(0);

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const monthDaysFull = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const firstGrid = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(firstGrid, i));
  }, [cursor]);

  const plusRow = monthDaysFull.slice(35, 42);
  const plusCount = useMemo(
    () => plusRow.filter(d => d.getMonth() === new Date(cursor.getFullYear(), cursor.getMonth(), 1).getMonth()).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cursor.getFullYear(), cursor.getMonth(), monthDaysFull]
  );

  const monthDays = useMemo(
    () => (expandedSixth ? monthDaysFull : monthDaysFull.slice(0, 35)),
    [expandedSixth, monthDaysFull]
  );

  useEffect(() => { setExpandedSixth(false); }, [view, cursor.getFullYear(), cursor.getMonth()]);

  const grouped = useMemo(() => {
    const g = new Map<string, UnionItem[]>();
    for (const t of tasks) {
      const key = ymd(new Date((t as unknown as { dueDate: string | Date }).dueDate));
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push({ kind: 'task', t });
    }
    for (const n of initialNotes ?? []) {
      const key = ymd(new Date((n as unknown as { at: string | Date }).at));
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push({ kind: 'note', n });
    }
    for (const [k, arr] of g) {
      arr.sort((a, b) => {
        const ap = a.kind === 'task' ? ((a.t as unknown as { priority?: string }).priority ?? 'normal') : 'zzz';
        const bp = b.kind === 'task' ? ((b.t as unknown as { priority?: string }).priority ?? 'normal') : 'zzz';
        if (ap !== bp) return ap === 'high' ? -1 : 1;
        const ta = a.kind === 'task' ? (a.t as unknown as { title?: string }).title ?? '' : (a.n as unknown as { title?: string }).title ?? '';
        const tb = b.kind === 'task' ? (b.t as unknown as { title?: string }).title ?? '' : (b.n as unknown as { title?: string }).title ?? '';
        return ta.localeCompare(tb, 'ru');
      });
      g.set(k, arr);
    }
    return g;
  }, [tasks, initialNotes]);

  useEffect(() => { setTasks(initialTasks); }, [initialTasks]);

  const next = () =>
    setCursor(d => view === 'week' ? addDays(d, 7) : new Date(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  const prev = () =>
    setCursor(d => view === 'week' ? addDays(d, -7) : new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()));
  const today = () => setCursor(startOfWeek(new Date()));

  function openDayModal(ymdStr: string) {
    dayJustOpenedAt.current = Date.now();
    window.dispatchEvent(new CustomEvent('calendar:open-day', { detail: { ymd: ymdStr } }));
  }
  function openNoteModal(noteId: string) {
    window.dispatchEvent(new CustomEvent('calendar:open-note', { detail: { noteId } }));
  }

  const headerMonthForCenter = view === 'week'
    ? new Date(cursor)
    : new Date(cursor.getFullYear(), cursor.getMonth(), 1);

  const isMonthView = view === 'month';
  const daysToRender = isMonthView ? monthDays : weekDays;

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={prev} style={btn()}>←</button>
          <button onClick={() => setView('week')} style={pill(view === 'week')}>Неделя</button>
          <button onClick={() => setView('month')} style={pill(view === 'month')}>Месяц</button>
        </div>

        <div style={{ textAlign: 'center', fontWeight: 800 }}>
          {fmtMonthYearRu(headerMonthForCenter)}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={next} style={btn()}>→</button>
          <button onClick={today} style={btn()}>Сегодня</button>
        </div>
      </div>

      <div
        className="grid"
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 8,
          alignItems: 'stretch',
        }}
      >
        {daysToRender.map((day) => {
          const key = ymd(day);
          const list = grouped.get(key) || [];
          const isToday = ymd(new Date()) === key;

          const isHoliday = isWeekend(day) || isRuHoliday(day);
          const weekday = WEEKDAYS[day.getDay()];
          const mmddKey = mmddInTz(day, 'Asia/Yekaterinburg');
          const bdays = birthdaysMap?.[mmddKey] || [];
          const inMonth = day.getMonth() === headerMonthForCenter.getMonth();

          /* ===== вычисления для счётчиков ===== */
          const now = nowEkaterinburg();

          const tasksOfDay = list
            .filter((it): it is { kind: 'task'; t: TaskLite } => it.kind === 'task')
            .map(it => it.t)
            .filter(t => !isArchivedTask(t));

          const notesOfDay = list
            .filter((it): it is { kind: 'note'; n: NoteLite } => it.kind === 'note')
            .map(it => it.n)
            .filter(n => !isArchivedNote(n));

          const tasksOverdue = tasksOfDay.some(t => deadlineFrom((t as unknown as { dueDate: string | Date }).dueDate).getTime() < now.getTime());
          const notesOverdue = notesOfDay.some(n => deadlineFrom((n as unknown as { at: string | Date }).at).getTime() < now.getTime());

          const tasksCount = tasksOfDay.length;
          const notesCount = notesOfDay.length;

          const baseTaskColor = tasksCount === 0 ? ZERO_GRAY : BD_MY;
          const baseNoteColor = notesCount === 0 ? ZERO_GRAY : NOTE_GREEN;

          /* стили строк-счётчиков с плашками */
          const lineBox: React.CSSProperties = { display: 'inline-block', borderRadius: 8, padding: '2px 8px' };
          const taskLineStyle: React.CSSProperties =
            tasksCount > 0
              ? {
                  ...lineBox,
                  background: TASK_BG_SOFT,
                  color: tasksOverdue ? OVERDUE_RED : baseTaskColor,
                  fontSize: 13,
                  fontWeight: tasksOverdue ? 800 : 700,
                }
              : { fontSize: 13, fontWeight: 700, color: ZERO_GRAY };
          const noteLineStyle: React.CSSProperties =
            notesCount > 0
              ? {
                  ...lineBox,
                  background: NOTE_BG_SOFT,
                  color: notesOverdue ? OVERDUE_RED : baseNoteColor,
                  fontSize: 13,
                  fontWeight: notesOverdue ? 800 : 700,
                }
              : { fontSize: 13, fontWeight: 700, color: ZERO_GRAY };

          return (
            <div key={key} className={`day ${isToday ? 'day--today' : ''} ${!inMonth ? 'day--out' : ''}`}>
              {/* header */}
              <div className="day__header">
                <div className={`daydate ${isHoliday ? 'red' : ''}`}>{fmtRuDateShort(day)}</div>
              </div>

              {/* content */}
              <div className="day__content" onClick={() => openDayModal(key)} role="button">
                <div><span style={taskLineStyle}>Задачи: {tasksCount}</span></div>
                <div><span style={noteLineStyle}>Заметки: {notesCount}</span></div>
              </div>

              {/* footer */}
              <div className="day__footer">
                {bdays.length ? (
                  <Tooltip
                    content={
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontWeight: 800, marginBottom: 2 }}>Дни рождения</div>
                        {bdays.map((n, i) => (
                          <div key={i} style={{ whiteSpace: 'nowrap' }}>• {n}</div>
                        ))}
                      </div>
                    }
                  >
                    <div className={`weekday ${isHoliday ? 'red' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      🥳 · {weekday}
                    </div>
                  </Tooltip>
                ) : (
                  <div className={`weekday ${isHoliday ? 'red' : ''}`}>{weekday}</div>
                )}

                <button
                  onClick={() => openDayModal(key)}
                  style={btnGhostSmall()}
                  title="Открыть задачи этого дня"
                >
                  Открыть
                </button>
              </div>
            </div>
          );
        })}

        {isMonthView && !expandedSixth && plusCount > 0 && (
          <button
            onClick={() => setExpandedSixth(true)}
            style={expandBtn()}
            aria-label={`Показать ещё ${plusCount} дн.`}
            title={`Показать ещё ${plusCount} дн.`}
          >
            +{plusCount}
          </button>
        )}
      </div>

     <style jsx>{`
  /* Карточка дня — grid: header / content / footer */
  .day {
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #ffffff;
    padding: 8px;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 6px;
    min-height: 120px;
    max-height: 240px;
    transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease, background .16s ease;
  }
  .day:hover { transform: translateY(-1px); border-color: rgba(141,40,40,.35); box-shadow: 0 8px 18px rgba(0,0,0,.06); background: linear-gradient(180deg, rgba(141,40,40,.08), rgba(141,40,40,.03)), linear-gradient(180deg, rgba(255,255,255,.9), rgba(255,255,255,.7)); }
  .day--today { background: #ecfdf5; border-color: #a7f3d0; }
  .day--out { background: #f3f4f6; color: #6b7280; }

  .day__header { display:flex; align-items:center; justify-content:space-between; }
  .daydate { font-weight: 800; }
  .weekday { font-size: 12px; color: #374151; }
  .red { color: #b91c1c; }

  /* ВАЖНО: прокручивается только контент, когда места не хватает */
  .day__content {
    display: grid;
    gap: 6px;
    grid-auto-rows: max-content;
    align-content: start;
    align-items: start;
    min-height: 0;
    overflow: auto;
    padding-right: 2px;
    cursor: pointer;
  }
  .day__content > * { align-self: start; }

  .day__content::-webkit-scrollbar { width: 8px; }
  .day__content::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 8px; }
  .day__content:hover::-webkit-scrollbar-thumb { background: #d1d5db; }

  .day__footer { margin-top: 0; display: flex; justify-content: space-between; align-items: center; }
`}</style>

<style jsx>{`
  .weekday { font-size: 12px; color: #374151; }
  .red { color: #b91c1c; }
`}</style>

<style jsx>{`
  @media (max-width: 520px) {
    .day { min-height: 112px; max-height: 224px; }
  }
`}</style>

<style jsx>{`
  .day:hover { /* эффект hover сохранён */ }
`}</style>

<style jsx>{`
  /* служебные стили */
`}</style>

    </section>
  );
}

/* ===== UI helpers ===== */
function btn(): React.CSSProperties {
  return { height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' };
}
function pill(active: boolean): React.CSSProperties {
  return { height: 32, padding: '0 12px', borderRadius: 999, border: '1px solid #e5e7eb', background: active ? '#111827' : '#fff', color: active ? '#fff' : '#111827', cursor: 'pointer', fontSize: 13 };
}
function btnGhostSmall(): React.CSSProperties {
  return { height: 28, padding: '0 10px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', cursor: 'pointer', fontSize: 12 };
}
function expandBtn(): React.CSSProperties {
  return { position: 'absolute', right: 12, bottom: 10, height: 28, minWidth: 48, padding: '0 10px', borderRadius: 999, border: '1px solid #d1d5db', background: '#f9fafb', color: '#111827', fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,.06)' };
}

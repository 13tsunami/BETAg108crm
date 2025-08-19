// app/(app)/calendar/CalendarBoard.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { TaskLite } from './page';
import { markAssigneeDoneAction } from '@/app/(app)/inboxtasks/actions';
import Tooltip from '@/components/Tooltip';

type Props = {
  meId: string;
  roleSlug: string | null;
  initialTasks: TaskLite[];
  initialGrouped: Record<string, TaskLite[]>;
  // опционально: карта ДР (MM-DD -> имена). Если не придёт — просто не показываем 🎉
  birthdaysMap?: Record<string, string[]>;
};

const BRAND = '#8d2828';
const BG_MY = '#FEF3C7';
const BD_MY = '#F59E0B';
const URGENT = BRAND;

// короткие названия дней (вс от 0 до 6)
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

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
// Ключ MM-DD в переданном часовом поясе (для ДР)
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
  // «1 июня» — считаем в Екатеринбурге
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Yekaterinburg', day: 'numeric', month: 'long' })
    .format(dt)
    .replace('.', '');
}
function fmtRuDateTimeYekb(d: Date | string) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(dt);
}
function fmtMonthYearRu(d: Date) {
  // «Май 2025»
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
    .format(d)
    .replace(/^./, s => s.toUpperCase());
}
function isWeekend(d: Date) {
  const wd = d.getDay();
  return wd === 0 || wd === 6;
}
function isRuHoliday(d: Date) {
  // Базовый фиксированный набор
  const md = mmdd(d);
  return (
    md === '01-01' || md === '01-02' || md === '01-03' || md === '01-04' ||
    md === '01-05' || md === '01-06' || md === '01-07' || md === '01-08' ||
    md === '02-23' || md === '03-08' || md === '05-01' || md === '05-09' ||
    md === '06-12' || md === '11-04'
  );
}

export default function CalendarBoard({
  meId,
  roleSlug,
  initialTasks,
  initialGrouped,
  birthdaysMap,
}: Props) {
  // ДЕФОЛТ — МЕСЯЦ (сохраняю твои модалки без изменений)
  const [view, setView] = useState<'week' | 'month'>('month');
  const [cursor, setCursor] = useState<Date>(startOfWeek(new Date()));

  const [tasks, setTasks] = useState<TaskLite[]>(initialTasks);

  const [dayModal, setDayModal] = useState<{ open: boolean; key: string | null }>({ open: false, key: null });
  const [taskModal, setTaskModal] = useState<{ open: boolean; task: TaskLite | null }>({ open: false, task: null });

  function handleDoneSubmit(taskId: string) {
    setTaskModal({ open: false, task: null });
    setDayModal({ open: false, key: null });
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);
  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const firstGrid = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(firstGrid, i));
  }, [cursor]);

  const grouped = useMemo(() => {
    const g = new Map<string, TaskLite[]>();
    for (const t of tasks) {
      const key = ymd(new Date(t.dueDate));
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(t);
    }
    for (const [k, arr] of g) {
      arr.sort((a, b) => {
        const ap = a.priority === 'high' ? 0 : 1;
        const bp = b.priority === 'high' ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (a.title || '').localeCompare(b.title || '', 'ru');
      });
      g.set(k, arr);
    }
    return g;
  }, [tasks]);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const next = () =>
    setCursor(d =>
      view === 'week' ? addDays(d, 7) : new Date(d.getFullYear(), d.getMonth() + 1, d.getDate()),
    );
  const prev = () =>
    setCursor(d =>
      view === 'week' ? addDays(d, -7) : new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()),
    );
  const today = () => setCursor(startOfWeek(new Date()));

  const TaskChip: React.FC<{ t: TaskLite }> = ({ t }) => {
    const urgent = (t.priority ?? 'normal') === 'high';
    return (
      <button
        onClick={() => setTaskModal({ open: true, task: t })}
        title={t.description || ''}
        style={{
          textAlign: 'left',
          borderRadius: 10,
          padding: '6px 8px',
          border: `1px solid ${urgent ? URGENT : BD_MY}`,
          background: BG_MY,
          cursor: 'pointer',
          minWidth: 0,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2, wordBreak: 'break-word' }}>
          {t.title}
        </div>
        <div style={{ fontSize: 12, color: '#374151' }}>
          {fmtRuDateShort(t.dueDate)}
        </div>
      </button>
    );
  };

  const DayModal = () => {
    if (!dayModal.open || !dayModal.key) return null;
    const list = grouped.get(dayModal.key) || [];
    return (
      <div style={overlay()}>
        <div style={modal()}>
          <header style={modalHeader()}>
            <div style={{ fontWeight: 800 }}>Задачи на {dayModal.key}</div>
            <button onClick={() => setDayModal({ open: false, key: null })} style={xBtn()} aria-label="Закрыть">×</button>
          </header>

          <div style={{ padding: 10 }}>
            {list.length === 0 && <div style={{ color: '#6b7280', fontSize: 13 }}>На этот день задач нет.</div>}

            <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
              {list.map((t) => {
                const urgent = (t.priority ?? 'normal') === 'high';
                return (
                  <div
                    key={t.id}
                    style={{
                      border: `1px solid ${urgent ? URGENT : BD_MY}`,
                      background: BG_MY,
                      borderRadius: 12,
                      padding: 10,
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, wordBreak: 'break-word' }}>{t.title}</div>
                        {urgent && (
                          <span style={{ fontSize: 11, color: URGENT, border: `1px solid ${URGENT}`, borderRadius: 999, padding: '0 6px' }}>
                            Срочно
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: '#374151' }}>
                        <span>Срок: {fmtRuDateTimeYekb(t.dueDate)}</span>
                        {t.createdByName ? <span>Назначил: {t.createdByName}</span> : null}
                      </div>
                    </div>

                    {t.description && (
                      <div style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        lineHeight: 1.4,
                        fontSize: 13,
                        color: '#111827'
                      }}>
                        {t.description}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <form action={markAssigneeDoneAction} onSubmit={() => handleDoneSubmit(t.id)}>
                        <input type="hidden" name="taskId" value={t.id} />
                        <button
                          type="submit"
                          style={btnPrimaryGreen()}
                          title="Отметить задачу выполненной"
                        >
                          Выполнить
                        </button>
                      </form>

                      <button
                        onClick={() => setTaskModal({ open: true, task: t })}
                        style={btnGhost()}
                        title="Открыть"
                      >
                        Открыть
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const TaskModal = () => {
    if (!taskModal.open || !taskModal.task) return null;
    const t = taskModal.task;
    const urgent = (t.priority ?? 'normal') === 'high';
    return (
      <div style={overlay()}>
        <div style={modal()}>
          <header style={modalHeader()}>
            <div style={{ fontWeight: 800 }}>Задача</div>
            <button onClick={() => setTaskModal({ open: false, task: null })} style={xBtn()} aria-label="Закрыть">×</button>
          </header>

          <div style={{ padding: 10, display: 'grid', gap: 10 }}>
            <div style={{
              border: `1px solid ${urgent ? URGENT : BD_MY}`,
              background: BG_MY,
              borderRadius: 12,
              padding: 10,
              display: 'grid',
              gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, wordBreak: 'break-word' }}>{t.title}</div>
                  {urgent && (
                    <span style={{ fontSize: 11, color: URGENT, border: `1px solid ${URGENT}`, borderRadius: 999, padding: '0 6px' }}>
                      Срочно
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: '#374151' }}>
                  <span>Срок: {fmtRuDateTimeYekb(t.dueDate)}</span>
                  {t.createdByName ? <span>Назначил: {t.createdByName}</span> : null}
                </div>
              </div>

              {t.description && (
                <div style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.4,
                  fontSize: 13,
                  color: '#111827'
                }}>
                  {t.description}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', alignItems: 'center' }}>
                <form action={markAssigneeDoneAction} onSubmit={() => handleDoneSubmit(t.id)}>
                  <input type="hidden" name="taskId" value={t.id} />
                  <button type="submit" style={btnPrimaryGreen()}>Выполнить</button>
                </form>
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  };

  // выберем месяца для заголовка по центру
  const headerMonthForCenter = view === 'week'
    ? new Date(cursor) // для недели берём месяц курсора
    : new Date(cursor.getFullYear(), cursor.getMonth(), 1);

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      {/* Шапка: слева ← [Неделя][Месяц], по центру «Май 2025», справа → Сегодня */}
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
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 8,
          alignItems: 'stretch',
        }}
      >
        {(view === 'week' ? weekDays : monthDays).map((day) => {
          const key = ymd(day);
          const list = grouped.get(key) || [];
          const isToday = ymd(new Date()) === key;

          const isHoliday = isWeekend(day) || isRuHoliday(day);
          const weekday = WEEKDAYS[day.getDay()];
          const mmddKey = mmddInTz(day, 'Asia/Yekaterinburg'); // ключ в Екб для ДР
          const bdays = birthdaysMap?.[mmddKey] || [];

          return (
            <div
              key={key}
              className={`day ${isToday ? 'day--today' : ''}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div className={`daydate ${isHoliday ? 'red' : ''}`}>{fmtRuDateShort(day)}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{/* место под доп. мету */}</div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                {list.map((t) => (
                  <TaskChip key={t.id} t={t} />
                ))}
                {list.length === 0 && (
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>Нет задач</div>
                )}
              </div>

              <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {/* День недели + опциональная 🎉 с красивым тултипом */}
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
                      <span role="img" aria-label="день рождения">🥳</span>
                      {weekday}
                    </div>
                  </Tooltip>
                ) : (
                  <div className={`weekday ${isHoliday ? 'red' : ''}`}>{weekday}</div>
                )}

                <button
                  onClick={() => setDayModal({ open: true, key })}
                  style={btnGhostSmall()}
                  title="Открыть задачи этого дня"
                >
                  Открыть
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <DayModal />
      <TaskModal />

      {/* Ховер как в сайдбаре + «сегодня» бледно‑зелёный */}
      <style jsx>{`
        .day {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #ffffff;
          padding: 8px;
          min-height: 120px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease, background .16s ease;
        }
        .day:hover {
          transform: translateY(-1px);
          border-color: rgba(141,40,40,.35);
          box-shadow: 0 8px 18px rgba(0,0,0,.06);
          background:
            linear-gradient(180deg, rgba(141,40,40,.08), rgba(141,40,40,.03)),
            linear-gradient(180deg, rgba(255,255,255,.9), rgba(255,255,255,.7));
        }
        .day--today {
          background: #ecfdf5; /* бледно-зелёный фон */
          border-color: #a7f3d0; /* бледно-зелёная рамка */
        }
        .daydate { font-weight: 800; }
        .weekday { font-size: 12px; color: #374151; }
        .red { color: #b91c1c; }
      `}</style>
    </section>
  );
}

/* ===== UI helpers (без изменений по логике модалок) ===== */
function btn(): React.CSSProperties {
  return {
    height: 32,
    padding: '0 10px',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    background: '#fff',
    cursor: 'pointer',
  };
}
function pill(active: boolean): React.CSSProperties {
  return {
    height: 32,
    padding: '0 12px',
    borderRadius: 999,
    border: '1px solid #e5e7eb',
    background: active ? '#111827' : '#fff',
    color: active ? '#fff' : '#111827',
    cursor: 'pointer',
    fontSize: 13,
  };
}
function overlay(): React.CSSProperties {
  return {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: 'rgba(15, 23, 42, .32)',
    display: 'grid',
    placeItems: 'center',
    padding: 12,
  };
}
function modal(): React.CSSProperties {
  return {
    width: 'min(900px, 96vw)',
    maxHeight: '85vh',
    background: 'rgba(255,255,255,.68)',
    backdropFilter: 'saturate(180%) blur(12px)',
    WebkitBackdropFilter: 'saturate(180%) blur(12px)',
    border: '1px solid rgba(229,231,235,.9)',
    borderRadius: 16,
    boxShadow: '0 10px 32px rgba(0,0,0,.16)',
    overflow: 'hidden',
  };
}
function modalHeader(): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid rgba(229,231,235,.9)',
  };
}
function xBtn(): React.CSSProperties {
  return {
    width: 28,
    height: 28,
    lineHeight: '26px',
    textAlign: 'center' as const,
    borderRadius: 8,
    border: '1px solid rgba(229,231,235,.9)',
    background: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
  };
}
function btnPrimaryGreen(): React.CSSProperties {
  return {
    height: 32,
    padding: '0 12px',
    borderRadius: 10,
    border: '1px solid #10b981',
    background: '#10b981',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
  };
}
function btnGhost(): React.CSSProperties {
  return {
    height: 32,
    padding: '0 12px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#111827',
    cursor: 'pointer',
    fontSize: 13,
  };
}
function btnGhostSmall(): React.CSSProperties {
  return {
    height: 28,
    padding: '0 10px',
    borderRadius: 999,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#111827',
    cursor: 'pointer',
    fontSize: 12,
  };
}

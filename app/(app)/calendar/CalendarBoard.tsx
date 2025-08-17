// app/(app)/calendar/CalendarBoard.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { TaskLite } from './page';
import { markAssigneeDoneAction } from '@/app/(app)/inboxtasks/actions';

type Props = {
  meId: string;
  roleSlug: string | null;
  initialTasks: TaskLite[];
  initialGrouped: Record<string, TaskLite[]>;
};

const BRAND = '#8d2828';
const BG_MY = '#FEF3C7';
const BD_MY = '#F59E0B';
const URGENT = BRAND;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
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
function fmtRuDate(d: Date | string) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(dt);
}
function fmtRuDateTimeYekb(d: Date | string) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(dt);
}

export default function CalendarBoard({
  meId,
  roleSlug,
  initialTasks,
  initialGrouped,
}: Props) {
  const [view, setView] = useState<'week' | 'month'>('week');
  const [cursor, setCursor] = useState<Date>(startOfWeek(new Date()));

  const [tasks, setTasks] = useState<TaskLite[]>(initialTasks);

  const [dayModal, setDayModal] = useState<{ open: boolean; key: string | null }>({ open: false, key: null });
  const [taskModal, setTaskModal] = useState<{ open: boolean; task: TaskLite | null }>({ open: false, task: null });

  // закрыть модалки + оптимистично убрать задачу
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
    setCursor((d) =>
      view === 'week' ? addDays(d, 7) : new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
    );
  const prev = () =>
    setCursor((d) =>
      view === 'week' ? addDays(d, -7) : new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
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
          {fmtRuDate(t.dueDate)}
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

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={prev} style={btn()}>←</button>
          <button onClick={today} style={btn()}>Сегодня</button>
          <button onClick={next} style={btn()}>→</button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setView('week')} style={pill(view === 'week')}>Неделя</button>
          <button onClick={() => setView('month')} style={pill(view === 'month')}>Месяц</button>
        </div>
      </div>

      <div
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

          return (
            <div
              key={key}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                background: isToday ? '#fff5f5' : '#ffffff',
                padding: 8,
                minHeight: 120,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontWeight: 600 }}>{day.getDate()}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{key}</div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                {list.map((t) => (
                  <TaskChip key={t.id} t={t} />
                ))}
                {list.length === 0 && (
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>Нет задач</div>
                )}
              </div>

              <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
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
    </section>
  );
}

/* ===== UI helpers ===== */
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

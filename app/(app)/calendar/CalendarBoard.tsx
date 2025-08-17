'use client';

import React, { useMemo, useState } from 'react';

type Assignee = {
  id: string;
  taskId: string;
  userId: string;
  status: 'in_progress' | 'done';
  assignedAt?: string | Date | null;
  completedAt?: string | Date | null;
};

type Task = {
  id: string;
  title: string;
  description?: string | null;
  dueDate: string | Date;
  hidden?: boolean | null;
  priority?: 'normal' | 'high' | null;
  createdById?: string | null;
  createdByName?: string | null;
  assignees: Assignee[];
};

type Props = {
  meId: string;
  roleSlug: string | null;
  initialTasks: Task[];
};

const BRAND = '#8d2828';
const COLOR_MINE = '#fde68a';     // жёлтый — назначенные мне
const COLOR_BYME = '#a9f7b3ff';   // зелёный — назначенные мной
const BG_EMPTY = '#ffffff';

// ----- utils -----
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday=0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function fmtRuDateWithOptionalTimeYekb(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).formatToParts(dt);

  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const dd = `${map.day} ${String(map.month || '').replace('.', '')}`;
  const yyyy = map.year;

  const hm = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(dt);
  const hh = hm.find(p => p.type === 'hour')?.value ?? '00';
  const mm = hm.find(p => p.type === 'minute')?.value ?? '00';

  const isDefaultEnd = hh === '23' && mm === '59';
  return isDefaultEnd ? `${dd} ${yyyy}` : `${dd} ${yyyy}, ${hh}:${mm}`;
}

// ----- модалки -----
type DayModalItem = {
  task: Task;
  isMine: boolean;   // назначена мне (in_progress)
  isByMe: boolean;   // создана мной
  urgent: boolean;
};
function useModalState<T>() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<T | null>(null);
  const openWith = (p: T) => { setPayload(p); setOpen(true); };
  const close = () => { setOpen(false); setPayload(null); };
  return { open, payload, openWith, close };
}

export default function CalendarBoard({ meId, roleSlug, initialTasks }: Props) {
  // «Все задачи» — только директор и заместитель+
  const canViewAll = useMemo(() => {
    const r = (roleSlug || '').toLowerCase();
    return r === 'director' || r === 'директор' || r === 'deputy_plus' || r === 'заместитель+';
  }, [roleSlug]);

  // ===== Параметры представления =====
  const [view, setView] = useState<'week' | 'month'>('week');
  const [cursor, setCursor] = useState<Date>(startOfWeek(new Date()));
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState<boolean>(false); // для canViewAll

  // Задачи берём из пропсов (серверная загрузка)
  const tasks = initialTasks;

  // ===== Фильтрация и «мои» флаги =====
  const visibleBase = useMemo(() => {
    const base = tasks.filter((t) => !!t.dueDate && !t.hidden);
    const qq = q.trim().toLowerCase();
    const searched = !qq
      ? base
      : base.filter(
          (t) =>
            (t.title || '').toLowerCase().includes(qq) ||
            (t.description || '').toLowerCase().includes(qq)
        );

    return searched.map((t) => {
      const mineActive = t.assignees.some(
        (a) => a.userId === meId && a.status === 'in_progress'
      );
      const byMe = (t.createdById ?? '') === meId;
      const urgent = (t.priority ?? 'normal') === 'high';
      return { task: t, isMine: mineActive, isByMe: byMe, urgent };
    });
  }, [tasks, q, meId]);

  const visibilityFiltered = useMemo(() => {
    if (canViewAll && showAll) return visibleBase;
    return visibleBase.filter((x) => x.isMine || x.isByMe);
  }, [visibleBase, canViewAll, showAll]);

  // ===== Группировка по дню =====
  const byDay = useMemo(() => {
    const map = new Map<string, DayModalItem[]>();
    for (const x of visibilityFiltered) {
      const d = new Date(x.task.dueDate);
      const key = ymd(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(x);
    }
    for (const [key, arr] of map) {
      arr.sort((a, b) => {
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        const ac = a.isMine ? 0 : 1; // жёлтые выше
        const bc = b.isMine ? 0 : 1;
        if (ac !== bc) return ac - bc;
        return (a.task.title || '').localeCompare(b.task.title || '', 'ru');
      });
      map.set(key, arr);
    }
    return map;
  }, [visibilityFiltered]);

  // ===== сетки дат =====
  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);
  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const firstGrid = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(firstGrid, i));
  }, [cursor]);

  // ===== модалки =====
  const dayModal = useModalState<{ dateKey: string; list: DayModalItem[] }>();
  const taskModal = useModalState<{ item: DayModalItem }>();

  // ===== helpers цветов =====
  function cardStyles(item: DayModalItem): React.CSSProperties {
    const urgent = item.urgent;
    const bg = item.isMine ? COLOR_MINE : item.isByMe ? COLOR_BYME : BG_EMPTY;
    return {
      textAlign: 'left',
      borderRadius: 10,
      padding: '6px 8px',
      border: `1px solid ${urgent ? BRAND : '#e5e7eb'}`,
      background: bg,
      cursor: 'pointer',
    };
  }

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      {/* Панель управления */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setCursor((d) => (view === 'week' ? addDays(d, -7) : new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())))} style={btn()}>
            ←
          </button>
          <button onClick={() => setCursor(startOfWeek(new Date()))} style={btn()}>
            Сегодня
          </button>
          <button onClick={() => setCursor((d) => (view === 'week' ? addDays(d, 7) : new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())))} style={btn()}>
            →
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="Поиск задач…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, minWidth: 220 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canViewAll ? (
            <>
              <button onClick={() => setShowAll(false)} style={pill(!showAll)} title="Показывать только мои задачи">Мои</button>
              <button onClick={() => setShowAll(true)}  style={pill(showAll)}  title="Показывать все задачи">Все</button>
            </>
          ) : (
            <span style={{ fontSize: 12, color: '#6b7280' }}>Режим: Мои задачи</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setView('week')}  style={pill(view === 'week')}>Неделя</button>
          <button onClick={() => setView('month')} style={pill(view === 'month')}>Месяц</button>
        </div>
      </div>

      {/* Сетка календаря */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, alignItems: 'stretch' }}>
        {(view === 'week' ? weekDays : monthDays).map((day) => {
          const key = ymd(day);
          const list = byDay.get(key) || [];
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
                {list.slice(0, 4).map((x) => {
                  const t = x.task;
                  return (
                    <button
                      key={t.id}
                      onClick={() => dayModal.openWith({ dateKey: key, list })}
                      style={cardStyles(x)}
                      title={t.description || ''}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {t.title}
                        {(t.priority ?? 'normal') === 'high' && (
                          <span style={{ fontSize: 11, color: BRAND, border: `1px solid ${BRAND}`, borderRadius: 999, padding: '0 6px' }}>
                            Срочно
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#374151' }}>
                        {fmtRuDateWithOptionalTimeYekb(t.dueDate as Date)}
                      </div>
                    </button>
                  );
                })}
                {list.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af' }}>Нет задач</div>}
                {list.length > 4 && (
                  <button
                    onClick={() => dayModal.openWith({ dateKey: key, list })}
                    style={{ height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 12, textAlign: 'left' }}
                  >
                    Ещё {list.length - 4}…
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== МОДАЛКА ДНЯ ===== */}
      {dayModal.open && dayModal.payload && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) dayModal.close(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}
        >
          <div
            role="dialog" aria-modal="true"
            style={{
              width: 'min(980px, 96vw)',
              maxHeight: '80vh',
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              display: 'grid',
              gridTemplateRows: 'auto 1fr',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontWeight: 700 }}>Задачи на {dayModal.payload.dateKey}</div>
              <button onClick={() => dayModal.close()} style={{ height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>
                Закрыть
              </button>
            </div>

            <div style={{ overflow: 'auto', padding: 12, display: 'grid', gap: 8 }}>
              {dayModal.payload.list.map((x) => {
                const t = x.task;
                const urgent = x.urgent;
                return (
                  <div
                    key={t.id}
                    style={{
                      border: `1px solid ${urgent ? BRAND : '#e5e7eb'}`,
                      borderRadius: 12,
                      background: x.isMine ? COLOR_MINE : x.isByMe ? COLOR_BYME : '#fff',
                      padding: 10,
                      display: 'grid',
                      gap: 8,
                      cursor: 'pointer',
                    }}
                    onClick={() => taskModal.openWith({ item: x })}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
                        {t.title}
                        {urgent && <span style={{ fontSize: 11, color: BRAND, border: `1px solid ${BRAND}`, borderRadius: 999, padding: '0 6px' }}>Срочно</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: '#374151' }}>
                        <span>Срок: {fmtRuDateWithOptionalTimeYekb(t.dueDate as Date)}</span>
                        {t.createdByName ? <span>Назначил: {t.createdByName}</span> : null}
                      </div>
                    </div>

                    {t.description ? (
                      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 8px', whiteSpace: 'pre-wrap', color: '#111827' }}>
                        {t.description}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {dayModal.payload.list.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>На этот день задач нет.</div>}
            </div>
          </div>
        </div>
      )}

      {/* ===== МОДАЛКА ЗАДАЧИ ===== */}
      {taskModal.open && taskModal.payload && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) taskModal.close(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1100, display: 'grid', placeItems: 'center', padding: 16 }}
        >
          <div
            role="dialog" aria-modal="true"
            style={{
              width: 'min(720px, 96vw)',
              maxHeight: '80vh',
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              display: 'grid',
              gridTemplateRows: 'auto 1fr auto',
              overflow: 'hidden',
            }}
          >
            {/* Заголовок */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700 }}>
                {taskModal.payload.item.task.title}
                {taskModal.payload.item.urgent && (
                  <span style={{ fontSize: 11, color: BRAND, border: `1px solid ${BRAND}`, borderRadius: 999, padding: '0 6px' }}>
                    Срочно
                  </span>
                )}
              </div>
              <button
                onClick={() => taskModal.close()}
                style={{ height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}
              >
                Закрыть
              </button>
            </div>

            {/* Тело */}
            <div style={{ overflow: 'auto', padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, color: '#374151' }}>
                <span>Срок: {fmtRuDateWithOptionalTimeYekb(taskModal.payload.item.task.dueDate as Date)}</span>
                {taskModal.payload.item.task.createdByName ? (
                  <span>Назначил: {taskModal.payload.item.task.createdByName}</span>
                ) : null}
              </div>

              {taskModal.payload.item.task.description ? (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', whiteSpace: 'pre-wrap', color: '#111827' }}>
                  {taskModal.payload.item.task.description}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#6b7280' }}>Без описания.</div>
              )}
            </div>

            {/* Футер */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderTop: '1px solid #f3f4f6' }}>
              <div />
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Безопасная отметка «Выполнить» через POST на /api/tasks/mark-done */}
                {taskModal.payload.item.isMine && (
                  <form method="post" action="/api/tasks/mark-done">
                    <input type="hidden" name="taskId" value={taskModal.payload.item.task.id} />
                    <button
                      type="submit"
                      style={{
                        height: 32, padding: '0 12px', borderRadius: 10,
                        border: '1px solid #10b981', background: '#10b981', color: '#fff',
                        cursor: 'pointer', fontSize: 13
                      }}
                      title="Отметить задачу выполненной"
                    >
                      Выполнить
                    </button>
                  </form>
                )}
                <button
                  onClick={() => taskModal.close()}
                  style={{ height: 32, padding: '0 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

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

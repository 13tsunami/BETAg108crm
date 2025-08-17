// app/(app)/calendar/CalendarBoard.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

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
  assignees: Assignee[];
};

type Props = {
  meId: string;
  roleSlug: string | null;
};

const BRAND = '#8d2828';
// Светлый фон для несрочных задач (бледно-синий)
const BG_SOFT = '#f0f9ff';

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // 0 -> Monday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default function CalendarBoard({ meId, roleSlug }: Props) {
  // ===== Параметры представления =====
  const [view, setView] = useState<'week' | 'month'>('week');
  const [cursor, setCursor] = useState<Date>(startOfWeek(new Date()));
  const isTeacher = roleSlug === 'Teacher' || roleSlug === 'Педагог' || roleSlug === 'Педагог +' || roleSlug === 'teacher';

  // НОВОЕ: Переключатель «Мои / Все»
  const [showMyOnly, setShowMyOnly] = useState<boolean>(isTeacher); // для Teacher всегда «Мои»

  // ===== Загрузка задач (оставляю как было: клиентская загрузка) =====
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState('');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      // Если у вас уже есть собственная загрузка, оставьте её.
      // Здесь — минимальный fetch. Можно заменить на любой ваш источник.
      const res = await fetch('/api/tasks', { cache: 'no-store' });
      const data: Task[] = await res.json();
      // Нормализация минимальная
      setTasks(
        (data || []).map((t) => ({
          ...t,
          hidden: !!t.hidden,
          priority: (t.priority === 'high' ? 'high' : 'normal') as 'normal' | 'high',
        }))
      );
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks, reload]);

  // ===== Фильтрация задач =====
  const base = useMemo(
    () => tasks.filter((t) => !!t.dueDate && !t.hidden),
    [tasks]
  );

  const myFiltered = useMemo(() => {
    if (!showMyOnly) return base;
    return base.filter(
      (t) => t.createdById === meId || t.assignees.some((a) => a.userId === meId)
    );
  }, [base, showMyOnly, meId]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return myFiltered;
    return myFiltered.filter(
      (t) =>
        (t.title || '').toLowerCase().includes(qq) ||
        (t.description || '').toLowerCase().includes(qq)
    );
  }, [myFiltered, q]);

  // ===== Группировка по дням =====
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of filtered) {
      const d = new Date(t.dueDate);
      const key = ymd(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    // сортировка внутри дня: срочные выше, затем по названию
    for (const [k, arr] of map) {
      arr.sort((a, b) => {
        const ap = a.priority === 'high' ? 0 : 1;
        const bp = b.priority === 'high' ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (a.title || '').localeCompare(b.title || '', 'ru');
      });
      map.set(k, arr);
    }
    return map;
  }, [filtered]);

  // ===== Сетки дат =====
  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const firstGrid = startOfWeek(first);
    // 6 недель на сетку (42 дня)
    return Array.from({ length: 42 }, (_, i) => addDays(firstGrid, i));
  }, [cursor]);

  // ===== Хэндлеры =====
  const next = () => setCursor((d) => (view === 'week' ? addDays(d, 7) : new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())));
  const prev = () => setCursor((d) => (view === 'week' ? addDays(d, -7) : new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())));
  const today = () => setCursor(startOfWeek(new Date()));

  // ===== Разметка =====
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      {/* Панель управления */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={prev} style={btn()}>
            ←
          </button>
          <button onClick={today} style={btn()}>
            Сегодня
          </button>
          <button onClick={next} style={btn()}>
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
          {/* НОВОЕ: Мои / Все. Для Teacher — только «Мои», поэтому не показываем вторую кнопку */}
          <button
            onClick={() => setShowMyOnly(true)}
            style={pill(showMyOnly)}
            title="Показывать только мои задачи"
          >
            Мои задачи
          </button>
          {!isTeacher && (
            <button
              onClick={() => setShowMyOnly(false)}
              style={pill(!showMyOnly)}
              title="Показывать все задачи"
            >
              Все задачи
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setView('week')} style={pill(view === 'week')}>
            Неделя
          </button>
          <button onClick={() => setView('month')} style={pill(view === 'month')}>
            Месяц
          </button>
        </div>
      </div>

      {/* Сетка календаря */}
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
                {list.map((t) => {
                  const urgent = (t.priority ?? 'normal') === 'high';
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        // Ваша логика открытия поповера/модалки (TaskPopover/CalendarWithAdd),
                        // оставляю как якорь для существующей реализации.
                        const ev = new CustomEvent('calendar:open-task', { detail: { taskId: t.id } });
                        window.dispatchEvent(ev);
                      }}
                      style={{
                        textAlign: 'left',
                        borderRadius: 10,
                        padding: '6px 8px',
                        border: `1px solid ${urgent ? BRAND : '#e5e7eb'}`,
                        background: urgent ? `${BRAND}1A` : BG_SOFT,
                        cursor: 'pointer',
                      }}
                      title={t.description || ''}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                        {t.title}
                      </div>
                      <div style={{ fontSize: 12, color: '#374151' }}>
                        {(t.assignees || []).length
                          ? `Исполнители: ${(t.assignees || []).length}`
                          : 'Без назначений'}
                      </div>
                    </button>
                  );
                })}
                {!loading && list.length === 0 && (
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>Нет задач</div>
                )}
                {loading && <div style={{ fontSize: 12, color: '#9ca3af' }}>Загрузка…</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Триггер на внешнее обновление данных после отметки "Выполнить" и т.п. */}
      <span hidden>{reload}</span>
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

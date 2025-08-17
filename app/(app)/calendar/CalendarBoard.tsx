'use client';

import React, { useMemo, useState } from 'react';

type Assignee = {
  id: string;
  userId: string;
  status: 'in_progress' | 'done';
  completedAt: string | null;
  user?: { id: string; name: string | null } | null;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string; // ISO
  hidden: boolean;
  priority: 'normal' | 'high';
  createdById: string | null;
  createdByName: string | null;
  assignees: Assignee[];
};

type Props = {
  meId: string;
  roleCanSeeAll: boolean;
  initialTasks: Task[];
};

const BRAND = '#8d2828';

// Цвета по договоренности:
// — назначенные МНЕ (я исполнитель): сочный жёлтый
// — назначенные МНОЙ (я автор): лёгкий голубой
// — срочно: красный бейдж
const BG_MINE = '#fef08a';       // yellow-200-ish
const BG_BYME = '#e0f2fe';       // sky-100-ish

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // monday-first
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default function CalendarBoard({ meId, roleCanSeeAll, initialTasks }: Props) {
  // Представление
  const [view, setView] = useState<'week' | 'month'>('week');
  const [cursor, setCursor] = useState<Date>(startOfWeek(new Date()));
  const [showMyOnly, setShowMyOnly] = useState<boolean>(!roleCanSeeAll); // если нельзя «все», держим «мои»

  const [q, setQ] = useState('');

  // База: берём только не скрытые (страница уже прислала hidden=false, но держим фильтр)
  const base = useMemo(
    () => (initialTasks || []).filter(t => !!t.dueDate && !t.hidden),
    [initialTasks]
  );

  // Флаг «мои» — либо я автор, либо я исполнитель
  const isMine = (t: Task) =>
    t.createdById === meId || t.assignees.some(a => a.userId === meId);

  // Фильтрация по правам/переключателю
  const scopeFiltered = useMemo(() => {
    if (!roleCanSeeAll) return base.filter(isMine);
    return showMyOnly ? base.filter(isMine) : base;
  }, [base, roleCanSeeAll, showMyOnly]);

  // Поиск
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return scopeFiltered;
    return scopeFiltered.filter(
      (t) =>
        (t.title || '').toLowerCase().includes(qq) ||
        (t.description || '').toLowerCase().includes(qq)
    );
  }, [scopeFiltered, q]);

  // Группировка по дням
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of filtered) {
      const d = new Date(t.dueDate);
      const key = ymd(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
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

  // Сетки дат
  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const firstGrid = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(firstGrid, i));
  }, [cursor]);

  const next = () => setCursor((d) => (view === 'week' ? addDays(d, 7) : new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())));
  const prev = () => setCursor((d) => (view === 'week' ? addDays(d, -7) : new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())));
  const today = () => setCursor(startOfWeek(new Date()));

  // Разметка
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      {/* Панель */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={prev} style={btn()}>←</button>
          <button onClick={today} style={btn()}>Сегодня</button>
          <button onClick={next} style={btn()}>→</button>
        </div>

        <input
          placeholder="Поиск задач…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, minWidth: 220 }}
        />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setShowMyOnly(true)}
            style={pill(showMyOnly)}
            title="Показывать только мои задачи"
            disabled={!roleCanSeeAll}
          >
            Мои задачи
          </button>
          <button
            onClick={() => setShowMyOnly(false)}
            style={pill(!showMyOnly)}
            title="Показывать все задачи"
            disabled={!roleCanSeeAll}
          >
            Все задачи
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setView('week')} style={pill(view === 'week')}>Неделя</button>
          <button onClick={() => setView('month')} style={pill(view === 'month')}>Месяц</button>
        </div>
      </div>

      {/* Сетка */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
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
                  const assignedToMe = t.assignees.some(a => a.userId === meId);
                  const createdByMe = t.createdById === meId;

                  // Выбор цвета:
                  // если я назначенный — желтый, если я автор — голубой, иначе белый (когда canSeeAll=true и включен режим "Все")
                  const bg = assignedToMe ? BG_MINE : createdByMe ? BG_BYME : '#fff';
                  const border = urgent ? BRAND : '#e5e7eb';

                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        // якорь на твою модалку (если будет)
                        const ev = new CustomEvent('calendar:open-task', { detail: { taskId: t.id } });
                        window.dispatchEvent(ev);
                      }}
                      style={{
                        textAlign: 'left',
                        borderRadius: 10,
                        padding: '6px 8px',
                        border: `1px solid ${border}`,
                        background: bg,
                        cursor: 'pointer',
                      }}
                      title={t.description || ''}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, display:'flex', gap:8, alignItems:'center' }}>
                        {t.title}
                        {urgent && <span style={{ fontSize: 10, color: '#fff', background: BRAND, borderRadius: 999, padding: '0 6px' }}>Срочно</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#374151' }}>
                        {(t.assignees || []).length ? `Исполнители: ${(t.assignees || []).length}` : 'Без назначений'}
                      </div>
                    </button>
                  );
                })}
                {list.length === 0 && (
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>Нет задач</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
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

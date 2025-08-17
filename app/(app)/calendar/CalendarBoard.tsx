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
  createdByName?: string | null;
  assignees: Assignee[];
};

type Props = {
  meId: string;
  canSeeAll: boolean; // разрешение показывать "Все задачи" (director, deputy_plus)
};

// Цвета (согласовано):
const BRAND = '#8d2828';
const TILE_MINE = '#ffe169';      // сочный жёлтый — назначенные МНЕ
const TILE_BYME = '#e6f1ff';      // лёгкий голубой — назначенные МНОЙ
const TILE_EVENT = '#e8f7ea';     // зелёный для будущих "событий" (плейсхолдер)
const TILE_BG = '#ffffff';

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
function fmtRuDate(d: Date | string) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(dt);
}
function fmtYekbTimeIfNotDefault(d: Date | string) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  // покажем HH:MM только если это не "23:59"
  const hh = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Yekaterinburg', hour: '2-digit' }).format(dt);
  const mm = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Yekaterinburg', minute: '2-digit' }).format(dt);
  if (hh === '23' && mm === '59') return '';
  return `${hh}:${mm}`;
}

export default function CalendarBoard({ meId, canSeeAll }: Props) {
  // ===== Параметры представления =====
  const [view, setView] = useState<'week' | 'month'>('week');
  const [cursor, setCursor] = useState<Date>(startOfWeek(new Date()));

  // Только director / deputy_plus видят "Все задачи". Остальные — всегда только "Мои".
  const [showMyOnly, setShowMyOnly] = useState<boolean>(!canSeeAll);

  // ===== Загрузка задач (read-only CRUD fetch) =====
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState('');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks', { cache: 'no-store' });
      const data: Task[] = await res.json();
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

  // ===== Фильтрация =====
  // Сначала отбросим "hidden"
  const visible = useMemo(() => (tasks || []).filter((t) => !!t.dueDate && !t.hidden), [tasks]);

  // Мои / Все
  const scoped = useMemo(() => {
    if (!showMyOnly) return visible;
    return visible.filter(
      (t) => t.createdById === meId || t.assignees.some((a) => a.userId === meId)
    );
  }, [visible, showMyOnly, meId]);

  // Поиск
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return scoped;
    return scoped.filter(
      (t) =>
        (t.title || '').toLowerCase().includes(qq) ||
        (t.description || '').toLowerCase().includes(qq)
    );
  }, [scoped, q]);

  // ===== Группировка по дням =====
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of filtered) {
      const d = new Date(t.dueDate);
      const key = ymd(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    // сортировка: срочные выше, затем по названию
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
    return Array.from({ length: 42 }, (_, i) => addDays(firstGrid, i));
  }, [cursor]);

  // ===== Модалка дня =====
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDayKey, setModalDayKey] = useState<string | null>(null);

  const openDay = (key: string) => {
    setModalDayKey(key);
    setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false);
    setModalDayKey(null);
  };

  // ===== Хэндлеры навигации =====
  const next = () =>
    setCursor((d) => (view === 'week' ? addDays(d, 7) : new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())));
  const prev = () =>
    setCursor((d) => (view === 'week' ? addDays(d, -7) : new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())));
  const today = () => setCursor(startOfWeek(new Date()));

  // ===== Вспомогательные =====
  const tileStyleForTask = (t: Task): React.CSSProperties => {
    const mineIncoming = t.assignees.some((a) => a.userId === meId);
    const iCreated = t.createdById === meId;

    // Приоритет отображения фона:
    // 1) если назначено мне — жёлтый
    // 2) иначе если назначено мной — голубой
    // 3) события (на будущее) — зелёный
    // 4) иначе — белый
    let bg = TILE_BG;
    if (mineIncoming) bg = TILE_MINE;
    else if (iCreated) bg = TILE_BYME;

    return {
      textAlign: 'left',
      borderRadius: 10,
      padding: '6px 8px',
      border: '1px solid #e5e7eb',
      background: bg,
      cursor: 'pointer',
    };
  };

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
          {/* Мои / Все — только если есть право */}
          <button
            onClick={() => setShowMyOnly(true)}
            style={pill(showMyOnly)}
            title="Показывать только мои задачи"
          >
            Мои задачи
          </button>
          {canSeeAll && (
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
                <button
                  onClick={() => openDay(key)}
                  title="Показать задачи этого дня"
                  style={{
                    border: 0,
                    background: 'transparent',
                    textAlign: 'left',
                    padding: 0,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {day.getDate()}
                </button>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{key}</div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                {list.map((t) => {
                  const urgent = (t.priority ?? 'normal') === 'high';
                  const timeStr = fmtYekbTimeIfNotDefault(t.dueDate);
                  return (
                    <button
                      key={t.id}
                      onClick={() => openDay(key)}
                      style={tileStyleForTask(t)}
                      title={t.description || ''}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                          {t.title}
                        </div>
                        {urgent && (
                          <span
                            style={{
                              fontSize: 11,
                              color: '#fff',
                              background: BRAND,
                              border: `1px solid ${BRAND}`,
                              borderRadius: 999,
                              padding: '0 6px',
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Срочно
                          </span>
                        )}
                      </div>
                      {timeStr ? (
                        <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
                          {timeStr}
                        </div>
                      ) : null}
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

      {/* Модалка дня */}
      {modalOpen && modalDayKey && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.35)',
            zIndex: 50,
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(920px, 96vw)',
              maxHeight: '86vh',
              overflow: 'auto',
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              boxShadow: '0 10px 24px rgba(0,0,0,.15)',
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                {modalDayKey} · {fmtRuDate(new Date(modalDayKey))}
              </div>
              <button
                onClick={closeModal}
                style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}
              >
                Закрыть
              </button>
            </div>

            <div style={{ padding: '0 12px 12px', display: 'grid', gap: 8 }}>
              {(byDay.get(modalDayKey) || []).map((t) => {
                const urgent = (t.priority ?? 'normal') === 'high';
                const mine = t.assignees.some((a) => a.userId === meId);
                const iCreated = t.createdById === meId;
                const timeStr = fmtYekbTimeIfNotDefault(t.dueDate);

                // вычислим счётчик выполнено/всего
                const total = t.assignees.length;
                const done = t.assignees.filter(a => a.status === 'done').length;

                return (
                  <details key={t.id} open style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
                    <summary style={{ padding: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 700 }}>{t.title}</span>
                        {urgent && (
                          <span style={{ fontSize: 11, color: '#fff', background: BRAND, border: `1px solid ${BRAND}`, borderRadius: 999, padding: '0 6px', fontWeight: 700 }}>
                            Срочно
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: '#374151' }}>
                        {timeStr ? <span>{timeStr}</span> : null}
                        {typeof t.createdByName === 'string' && t.createdByName ? (
                          <span>Назначил: {t.createdByName}</span>
                        ) : null}
                        {total > 0 ? <span style={{ color: '#111827', fontWeight: 700 }}>{done}/{total} выполнено</span> : null}
                      </div>
                    </summary>
                    <div style={{ padding: 10, borderTop: '1px solid #f3f4f6', display: 'grid', gap: 8 }}>
                      {t.description ? (
                        <div style={{ fontSize: 14, color: '#111827', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                          {t.description}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>Без описания</div>
                      )}

                      {/* Кнопки действий — перенаправляем в раздел задач, где есть серверные формы */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                        {mine && (
                          <a
                            href="/inboxtasks?tab=mine"
                            style={btnPrimaryGreenLink()}
                            title="Открыть мои задачи и отметить выполненной"
                          >
                            Отметить выполненной
                          </a>
                        )}
                        {(iCreated || mine) && (
                          <a
                            href={`/inboxtasks?tab=${iCreated ? 'byme' : 'mine'}`}
                            style={btnGhostLink()}
                          >
                            Открыть в задачах
                          </a>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
              {!loading && (byDay.get(modalDayKey) || []).length === 0 && (
                <div style={{ fontSize: 13, color: '#6b7280' }}>На этот день задач нет.</div>
              )}
              {loading && <div style={{ fontSize: 13, color: '#6b7280' }}>Загрузка…</div>}
            </div>
          </div>
        </div>
      )}

      {/* локальные стили без styled-jsx */}
      <style>{`
        @media (max-width: 980px) {
          /* сетка сама схлопывается только на странице задач, здесь — адаптив через auto-fit не нужен */
        }
      `}</style>
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
function btnPrimaryGreenLink(): React.CSSProperties {
  return {
    height: 32,
    padding: '0 12px',
    borderRadius: 10,
    border: '1px solid #10b981',
    background: '#10b981',
    color: '#fff',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 13,
    fontWeight: 700,
  };
}
function btnGhostLink(): React.CSSProperties {
  return {
    height: 32,
    padding: '0 12px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#111827',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 13,
  };
}

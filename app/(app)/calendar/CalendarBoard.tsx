// app/(app)/calendar/CalendarBoard.tsx
'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Prisma } from '@prisma/client';

type TaskWithAssignees = Prisma.TaskGetPayload<{ include: { assignees: true } }>;

type Props = {
  meId: string;
  roleSlug: string | null;
  view: 'week' | 'month';
  mode: 'mine' | 'all';
  cursorYmd: string; // YYYY-MM-DD в Екб
  tasks: TaskWithAssignees[];
};

const BRAND = '#8d2828';
const BG_SOFT = '#f0f9ff';
const YEKAT = 'Asia/Yekaterinburg';

// ====== helpers (клиент) ======
function formatYekbYmd(d: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: YEKAT, year:'numeric', month:'2-digit', day:'2-digit' });
  return fmt.format(d); // YYYY-MM-DD
}
function ymdToUtcFromYekbStart(ymd: string): Date {
  const local = new Date(`${ymd}T00:00:00+05:00`);
  return new Date(local.toISOString());
}
function addDaysFromYmd(ymd: string, days: number): string {
  const startUtc = ymdToUtcFromYekbStart(ymd);
  startUtc.setUTCDate(startUtc.getUTCDate() + days);
  return formatYekbYmd(startUtc);
}
function addMonthsFromYmd(ymd: string, months: number): string {
  const startUtc = ymdToUtcFromYekbStart(ymd);
  const iso = startUtc.toISOString().slice(0,10);
  const local = new Date(`${iso}T00:00:00+05:00`);
  local.setUTCMonth(local.getUTCMonth() + months);
  return formatYekbYmd(new Date(local.toISOString()));
}
function startOfWeekYmd(ymd: string): string {
  const local = new Date(`${ymd}T00:00:00+05:00`);
  const wd = (local.getUTCDay() + 6) % 7; // 0=Mon
  local.setUTCDate(local.getUTCDate() - wd);
  return formatYekbYmd(new Date(local.toISOString()));
}
function weekGrid(weekStartYmd: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysFromYmd(weekStartYmd, i));
}
function monthGrid(firstOfMonthYmd: string): string[] {
  // сетка 6 недель: берем понедельник недели, в которую попало 1-е число
  const firstUtc = ymdToUtcFromYekbStart(firstOfMonthYmd);
  const firstYmdMonday = startOfWeekYmd(formatYekbYmd(firstUtc));
  return Array.from({ length: 42 }, (_, i) => addDaysFromYmd(firstYmdMonday, i));
}

export default function CalendarBoard({ meId, roleSlug, view, mode, cursorYmd, tasks }: Props) {
  const router = useRouter();
  const isTeacher = roleSlug === 'Педагог' || roleSlug === 'Педагог +' || roleSlug === 'Teacher' || roleSlug === 'teacher';

  // ключ дня по Екб
  const byDay = useMemo(() => {
    const m = new Map<string, TaskWithAssignees[]>();
    for (const t of tasks) {
      const k = formatYekbYmd(new Date(t.dueDate)); // dueDate -> день в Екб
      const arr = m.get(k) ?? [];
      arr.push(t);
      m.set(k, arr);
    }
    // сортировка: срочные сверху, затем по названию
    for (const [k, arr] of m) {
      arr.sort((a, b) => {
        const ap = (a.priority ?? 'normal') === 'high' ? 0 : 1;
        const bp = (b.priority ?? 'normal') === 'high' ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (a.title || '').localeCompare(b.title || '', 'ru');
      });
      m.set(k, arr);
    }
    return m;
  }, [tasks]);

  const dayKeys: string[] = useMemo(() => {
    if (view === 'week') return weekGrid(startOfWeekYmd(cursorYmd));
    // month: сделать YYYY-MM-01
    const firstOfMonth = cursorYmd.slice(0,7) + '-01';
    return monthGrid(firstOfMonth);
  }, [view, cursorYmd]);

  // Навигация меняет URL-параметры (сервер перезагрузит данные)
  function pushWith(viewNext: 'week'|'month', modeNext: 'mine'|'all', cursorNext: string) {
    const params = new URLSearchParams();
    params.set('view', viewNext);
    params.set('mode', modeNext);
    params.set('cursor', cursorNext);
    router.push(`/calendar?${params.toString()}`);
  }

  const goPrev = () => {
    if (view === 'week') pushWith('week', mode, addDaysFromYmd(startOfWeekYmd(cursorYmd), -7));
    else pushWith('month', mode, addMonthsFromYmd(cursorYmd, -1));
  };
  const goNext = () => {
    if (view === 'week') pushWith('week', mode, addDaysFromYmd(startOfWeekYmd(cursorYmd), +7));
    else pushWith('month', mode, addMonthsFromYmd(cursorYmd, +1));
  };
  const goToday = () => {
    const today = formatYekbYmd(new Date());
    pushWith(view, mode, view === 'week' ? startOfWeekYmd(today) : today);
  };

  const setViewWeek = () => pushWith('week', mode, startOfWeekYmd(cursorYmd));
  const setViewMonth = () => pushWith('month', mode, cursorYmd);
  const setModeMine = () => pushWith(view, 'mine', cursorYmd);
  const setModeAll  = () => pushWith(view, 'all',  cursorYmd);

  // Разметка
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      {/* Панель управления */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={goPrev} style={btn()}>←</button>
          <button onClick={goToday} style={btn()}>Сегодня</button>
          <button onClick={goNext} style={btn()}>→</button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={setViewWeek}  style={pill(view === 'week')}>Неделя</button>
          <button onClick={setViewMonth} style={pill(view === 'month')}>Месяц</button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={setModeMine} style={pill(mode === 'mine')}>Мои задачи</button>
          {!isTeacher && (
            <button onClick={setModeAll} style={pill(mode === 'all')}>Все задачи</button>
          )}
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
        {dayKeys.map((key) => {
          const list = byDay.get(key) || [];
          const isToday = key === formatYekbYmd(new Date());
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
                <div style={{ fontWeight: 600 }}>{Number(key.slice(-2))}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{key}</div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                {list.map((t) => {
                  const urgent = (t.priority ?? 'normal') === 'high';
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        // здесь можно открыть вашу модалку/поповер
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

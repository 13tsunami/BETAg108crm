'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

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

export default function CalendarModals({ tasks, meId }: { tasks: Task[]; meId: string }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [dayIso, setDayIso] = useState<string | null>(null); // YYYY-MM-DD

  const mapById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  const tasksByDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      const d = new Date(t.dueDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    for (const [k, arr] of m) {
      arr.sort((a, b) => {
        const ap = a.priority === 'high' ? 0 : 1;
        const bp = b.priority === 'high' ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (a.title || '').localeCompare(b.title || '', 'ru');
      });
      m.set(k, arr);
    }
    return m;
  }, [tasks]);

  useEffect(() => {
    const onOpenTask = (e: Event) => {
      const id = (e as CustomEvent).detail?.taskId as string | undefined;
      if (id) setTaskId(id);
    };
    const onOpenDay = (e: Event) => {
      const iso = (e as CustomEvent).detail?.ymd as string | undefined;
      if (iso) setDayIso(iso);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setTaskId(null); setDayIso(null); }
    };
    window.addEventListener('calendar:open-task', onOpenTask as any);
    window.addEventListener('calendar:open-day', onOpenDay as any);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('calendar:open-task', onOpenTask as any);
      window.removeEventListener('calendar:open-day', onOpenDay as any);
      window.removeEventListener('keydown', onEsc);
    };
  }, []);

  const task = taskId ? mapById.get(taskId) ?? null : null;
  const dayList = dayIso ? (tasksByDay.get(dayIso) ?? []) : [];

  // Портал для модалок
  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Модалка задачи */}
      {task && (
        <div role="dialog" aria-modal className="cal-modal__backdrop" onClick={() => setTaskId(null)}>
          <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
            <header className="cal-modal__header">
              <div className="cal-modal__title">
                <strong>{task.title}</strong>
                {task.priority === 'high' ? <span className="badge badge--urgent">Срочно</span> : null}
              </div>
              <button className="cal-close" onClick={() => setTaskId(null)} aria-label="Закрыть">×</button>
            </header>

            <div className="cal-modal__meta">
              <span>Дедлайн: {fmtRu(task.dueDate)}</span>
              {task.createdByName ? <span>Назначил: {task.createdByName}</span> : null}
            </div>

            {task.description ? (
              <div className="cal-modal__desc">{task.description}</div>
            ) : (
              <div className="cal-modal__desc cal-modal__desc--empty">Без описания</div>
            )}

            <div className="cal-modal__assignees">
              <div className="muted">Исполнители:</div>
              <div className="chips">
                {(task.assignees || []).map(a => (
                  <span key={a.id} className={`chip ${a.status === 'done' ? 'chip--done' : ''}`}>
                    {a.user?.name ?? `${a.userId.slice(0, 8)}…`} {a.status === 'done' ? '✓' : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модалка дня */}
      {dayIso && (
        <div role="dialog" aria-modal className="cal-modal__backdrop" onClick={() => setDayIso(null)}>
          <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
            <header className="cal-modal__header">
              <div className="cal-modal__title">
                <strong>Задачи за {fmtRu(dayIso)}</strong>
              </div>
              <button className="cal-close" onClick={() => setDayIso(null)} aria-label="Закрыть">×</button>
            </header>

            {dayList.length === 0 ? (
              <div className="muted">Нет задач</div>
            ) : (
              <div className="day-list">
                {dayList.map(t => {
                  const urgent = t.priority === 'high';
                  const youExec = t.assignees.some(a => a.userId === meId);
                  const youAuthor = t.createdById === meId;
                  return (
                    <button
                      key={t.id}
                      className="day-item"
                      onClick={() => {
                        setDayIso(null);
                        setTaskId(t.id);
                      }}
                      title={t.description || ''}
                    >
                      <div className="day-item__title">
                        {t.title}
                        {urgent ? <span className="badge badge--urgent">Срочно</span> : null}
                      </div>
                      <div className="day-item__meta">
                        <span>{youExec ? 'Мне' : youAuthor ? 'Мной' : 'Задача'}</span>
                        {t.createdByName ? <span>· {t.createdByName}</span> : null}
                        <span>· Исп.: {(t.assignees || []).length}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .cal-modal__backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,.35);
          display: grid; place-items: center; z-index: 1000;
        }
        .cal-modal {
          width: min(720px, calc(100vw - 24px));
          max-height: calc(100vh - 24px);
          overflow: auto;
          background:#fff; border:1px solid #e5e7eb; border-radius: 12px; padding: 12px;
          box-shadow: 0 12px 32px rgba(0,0,0,.18);
        }
        .cal-modal__header {
          display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;
        }
        .cal-modal__title { display:flex; align-items:center; gap:8px; }
        .cal-close { border:1px solid #e5e7eb; background:#fff; border-radius:8px; width:28px; height:28px; cursor:pointer; }
        .badge { font-size:10px; border-radius:999px; padding:0 6px; }
        .badge--urgent { color:#fff; background:#8d2828; }
        .cal-modal__meta { display:flex; gap:12px; font-size:12px; color:#374151; margin:6px 0 10px; flex-wrap:wrap; }
        .cal-modal__desc {
          white-space:pre-wrap; background:#fafafa; border:1px solid #f3f4f6; border-radius:8px; padding:10px; margin-bottom:10px;
        }
        .cal-modal__desc--empty { color:#6b7280; font-style:italic; }
        .cal-modal__assignees .chips { display:flex; gap:8px; flex-wrap:wrap; }
        .chip { border:1px solid #e5e7eb; border-radius:999px; padding:2px 8px; font-size:12px; background:#fff; }
        .chip--done { background:#ecfdf5; }
        .muted { color:#6b7280; font-size:12px; }
        .day-list { display:grid; gap:8px; }
        .day-item {
          text-align:left; border:1px solid #e5e7eb; background:#fff; cursor:pointer;
          border-radius:10px; padding:8px;
        }
        .day-item__title { font-size:13px; font-weight:600; display:flex; gap:8px; align-items:center; margin-bottom:2px; }
        .day-item__meta { font-size:12px; color:#374151; display:flex; gap:6px; flex-wrap:wrap; }
      `}</style>
    </>
  , document.body);
}

function fmtRu(dateOrIso: string | Date) {
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  return new Intl.DateTimeFormat('ru-RU', { day:'2-digit', month:'short', year:'numeric'}).format(d).replace('.', '');
}

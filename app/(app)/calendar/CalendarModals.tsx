'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { NoteLite } from './page';
import { createNoteAction, updateNoteAction, deleteNoteAction, markMyTaskDoneAction } from './actions';

type Task = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string; // ISO
  hidden?: boolean | null;
  priority: 'normal' | 'high' | null;
  createdById: string | null;
  createdByName: string | null;
};

type Props = { tasks: Task[]; meId: string; notes?: NoteLite[] };

export default function CalendarModals({ tasks, meId, notes = [] }: Props) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [dayIso, setDayIso] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [newNote, setNewNote] = useState<{ atISO: string; allDay: boolean } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editNoteMode, setEditNoteMode] = useState<boolean>(false);
  const [dayFilter, setDayFilter] = useState<'all' | 'tasks' | 'notes'>('all');

  const mapById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  const tasksByDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = ymd(new Date(t.dueDate));
      (m.get(key) ?? m.set(key, []).get(key)!)!.push(t);
    }
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

  const notesByDay = useMemo(() => {
    const m = new Map<string, NoteLite[]>();
    for (const n of notes) {
      const key = ymd(new Date(n.at));
      (m.get(key) ?? m.set(key, []).get(key)!)!.push(n);
    }
    for (const [k, arr] of m) {
      arr.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'ru'));
      m.set(k, arr);
    }
    return m;
  }, [notes]);

  useEffect(() => {
    const onOpenTask = (e: Event) => {
      const id = (e as CustomEvent).detail?.taskId as string | undefined;
      if (id) { setTaskId(id); setDayIso(null); setNoteId(null); setNewNote(null); setEditNoteMode(false); }
    };
    const onOpenDay = (e: Event) => {
      const iso = (e as CustomEvent).detail?.ymd as string | undefined;
      if (iso) {
        setDayIso(iso);
        setTaskId(null); setNoteId(null); setNewNote(null);
        setExpanded(new Set()); setEditNoteMode(false);
        setDayFilter('all');
      }
    };
    const onOpenNote = (e: Event) => {
      const id = (e as CustomEvent).detail?.noteId as string | undefined;
      const editing = !!(e as CustomEvent).detail?.editing;
      if (id) { setNoteId(id); setTaskId(null); setDayIso(null); setNewNote(null); setEditNoteMode(editing); }
    };
    const onOpenNewNote = (e: Event) => {
      const detail = (e as CustomEvent).detail as { atISO?: string; allDay?: boolean } | undefined;
      const atISO = detail?.atISO ?? new Date().toISOString();
      const alld = detail?.allDay ?? true;
      setNewNote({ atISO, allDay: alld });
      setTaskId(null); setDayIso(null); setNoteId(null); setExpanded(new Set()); setEditNoteMode(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll(); };

    window.addEventListener('calendar:open-task', onOpenTask as any);
    window.addEventListener('calendar:open-day', onOpenDay as any);
    window.addEventListener('calendar:open-note', onOpenNote as any);
    window.addEventListener('calendar:open-new-note', onOpenNewNote as any);
    window.addEventListener('open-task', onOpenTask as any);
    window.addEventListener('open-day', onOpenDay as any);
    window.addEventListener('open-note', onOpenNote as any);
    window.addEventListener('open-new-note', onOpenNewNote as any);
    window.addEventListener('keydown', onEsc);

    return () => {
      window.removeEventListener('calendar:open-task', onOpenTask as any);
      window.removeEventListener('calendar:open-day', onOpenDay as any);
      window.removeEventListener('calendar:open-note', onOpenNote as any);
      window.removeEventListener('calendar:open-new-note', onOpenNewNote as any);
      window.removeEventListener('open-task', onOpenTask as any);
      window.removeEventListener('open-day', onOpenDay as any);
      window.removeEventListener('open-note', onOpenNote as any);
      window.removeEventListener('open-new-note', onOpenNewNote as any);
      window.removeEventListener('keydown', onEsc);
    };
  }, []);

  const task = taskId ? mapById.get(taskId) ?? null : null;
  const dayTasks = dayIso ? (tasksByDay.get(dayIso) ?? []) : [];
  const dayNotes = dayIso ? (notesByDay.get(dayIso) ?? []) : [];
  const note = noteId ? notes.find(n => n.id === noteId) ?? null : null;

  const filteredDayTasks = dayFilter === 'all' || dayFilter === 'tasks' ? dayTasks : [];
  const filteredDayNotes = dayFilter === 'all' || dayFilter === 'notes' ? dayNotes : [];

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* ==== TASK MODAL (glass-стиль) ==== */}
      {task && (
        <div role="dialog" aria-modal className="cal-modal__backdrop" onClick={() => setTaskId(null)}>
          <div className="cal-modal glass" onClick={(e) => e.stopPropagation()}>
            <header className="cal-modal__header">
              <div className="cal-modal__title">
                <strong className="wb">{task.title}</strong>
                {(task.priority ?? 'normal') === 'high' ? <span className="badge badge--urgent">Срочно</span> : null}
              </div>
              <button className="cal-close" onClick={() => setTaskId(null)} aria-label="Закрыть">×</button>
            </header>

            <div className="cal-modal__meta">
              <span>Дедлайн: {fmtRu(task.dueDate)}</span>
              {task.createdByName ? <span>Назначил: {task.createdByName}</span> : null}
            </div>

            {task.description ? (
              <div className="cal-modal__desc scrollbox wb">{task.description}</div>
            ) : (
              <div className="cal-modal__desc cal-modal__desc--empty">Без описания</div>
            )}

            <div style={{ display:'flex', gap:8, marginTop:6 }}>
              <form action={markMyTaskDoneAction}>
                <input type="hidden" name="taskId" value={task.id} />
                <button type="submit" className="btn btn--primary">Выполнить</button>
              </form>
              <button type="button" className="btn btn--ghost" onClick={() => setTaskId(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {/* ==== DAY MODAL ==== */}
      {dayIso && (
        <div role="dialog" aria-modal className="cal-modal__backdrop" onClick={() => setDayIso(null)}>
          <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
            <header className="cal-modal__header">
              <div className="cal-modal__title"><strong>За {fmtRu(dayIso)}</strong></div>
              <button className="cal-close" onClick={() => setDayIso(null)} aria-label="Закрыть">×</button>
            </header>

            {/* Фильтр */}
            <div className="day-filter" role="tablist" aria-label="Фильтр содержимого дня">
              <button role="tab" aria-selected={dayFilter === 'all'}   className={tabCls(dayFilter === 'all')}   onClick={() => setDayFilter('all')}>Все</button>
              <button role="tab" aria-selected={dayFilter === 'tasks'} className={tabCls(dayFilter === 'tasks')} onClick={() => setDayFilter('tasks')}>Задачи</button>
              <button role="tab" aria-selected={dayFilter === 'notes'} className={tabCls(dayFilter === 'notes')} onClick={() => setDayFilter('notes')}>Заметки</button>
            </div>

            {filteredDayTasks.length === 0 && filteredDayNotes.length === 0 ? (
              <div className="muted">Пусто</div>
            ) : (
              <div className="day-list">
                {/* задачи */}
                {[...filteredDayTasks].sort(sortTasks).map(t => {
                  const urgent = (t.priority ?? 'normal') === 'high';
                  const isExp = expanded.has(`t:${t.id}`);
                  return (
                    <div key={t.id} className={`day-item day-item--task ${urgent ? 'day-item--urgent' : ''}`}>
                      <button
                        className="day-item__main day-item__main--compact"
                        onClick={() => { setDayIso(null); setTaskId(t.id); }}
                        title={t.description || ''}
                      >
                        <div className="day-item__title wb clamp1">
                          {t.title}
                          {urgent ? <span className="badge badge--urgent">Срочно</span> : null}
                        </div>
                        {t.createdByName ? <div className="day-item__kicker wb clamp1">Назначил(а): {t.createdByName}</div> : null}
                      </button>

                      <button
                        className="day-item__disclosure"
                        aria-expanded={isExp}
                        aria-label={isExp ? 'Свернуть' : 'Развернуть'}
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = new Set(expanded);
                          const key = `t:${t.id}`;
                          if (next.has(key)) next.delete(key); else next.add(key);
                          setExpanded(next);
                        }}
                      >
                        {isExp ? '▴' : '▾'}
                      </button>

                      {isExp && (
                        <div className="day-item__details">
                          <div className="day-item__meta"><span>Дедлайн: {fmtRu(t.dueDate)}</span></div>
                          {t.description && <div className="day-item__desc scrollbox-inner wb">{t.description}</div>}
                          <div style={{ display:'flex', gap:8, marginTop:6 }}>
                            <form action={markMyTaskDoneAction}>
                              <input type="hidden" name="taskId" value={t.id} />
                              <button type="submit" className="btn btn--primary">Выполнить</button>
                            </form>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* заметки */}
                {filteredDayNotes.map(n => {
                  const isExp = expanded.has(`n:${n.id}`);
                  return (
                    <div key={n.id} className="day-item day-item--note">
                      <button
                        className="day-item__main day-item__main--compact"
                        onClick={() => { setDayIso(null); setEditNoteMode(false); setNoteId(n.id); }}
                        title={n.text || ''}
                      >
                        <div className="day-item__title wb clamp1">{n.title ?? 'Заметка'}</div>
                        {n.text ? <div className="day-item__kicker wb clamp1">{truncate(n.text, 140)}</div> : null}
                      </button>

                      <button
                        className="day-item__disclosure"
                        aria-expanded={isExp}
                        aria-label={isExp ? 'Свернуть' : 'Развернуть'}
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = new Set(expanded);
                          const key = `n:${n.id}`;
                          if (next.has(key)) next.delete(key); else next.add(key);
                          setExpanded(next);
                        }}
                      >
                        {isExp ? '▴' : '▾'}
                      </button>

                      {isExp && (
                        <div className="day-item__details note-details">
                          <div className="day-item__meta">
                            <span>{n.allDay ? 'Весь день' : 'Время'}</span>
                            <span>· {fmtRu(n.at)}</span>
                          </div>
                          {n.text && <div className="day-item__desc scrollbox-inner wb">{n.text}</div>}
                          <div style={{ display:'flex', gap:8, marginTop:6 }}>
                            <button
                              type="button"
                              className="btn btn--primary"
                              onClick={() => { setDayIso(null); setNoteId(n.id); setEditNoteMode(true); }}
                              title="Редактировать"
                            >
                              Редактировать
                            </button>
                            <form action={deleteNoteAction}>
                              <input type="hidden" name="noteId" value={n.id} />
                              <button type="submit" className="btn btn--danger">Удалить</button>
                            </form>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==== NOTE MODAL (просмотр/редактирование) ==== */}
      {note && (
        <div role="dialog" aria-modal className="cal-modal__backdrop" onClick={() => setNoteId(null)}>
          <div className="cal-modal glass" onClick={(e) => e.stopPropagation()}>
            <header className="cal-modal__header">
              <div className="cal-modal__title"><strong className="wb">{editNoteMode ? 'Редактировать заметку' : (note.title ?? 'Заметка')}</strong></div>
              <button className="cal-close" onClick={() => setNoteId(null)} aria-label="Закрыть">×</button>
            </header>

            {!editNoteMode ? (
              <>
                <div className="cal-modal__meta">
                  <span>{note.allDay ? 'Весь день' : 'Время'} · {fmtRu(note.at)}</span>
                </div>
                {note.text ? <div className="cal-modal__desc scrollbox wb">{note.text}</div> : <div className="cal-modal__desc cal-modal__desc--empty">Без текста</div>}
                <div style={{ display:'flex', gap:8 }}>
                  <button type="button" className="btn btn--primary" onClick={() => setEditNoteMode(true)}>Редактировать</button>
                  <form action={deleteNoteAction}>
                    <input type="hidden" name="noteId" value={note.id} />
                    <button type="submit" className="btn btn--danger">Удалить</button>
                  </form>
                  <button type="button" className="btn btn--ghost" onClick={() => setNoteId(null)}>Закрыть</button>
                </div>
              </>
            ) : (
              <NoteForm
                mode="edit"
                submitLabel="Сохранить"
                action={updateNoteAction}
                defaults={{
                  noteId: note.id,
                  dateISO: note.at,
                  allDay: note.allDay,
                  title: note.title ?? '',
                  text: note.text ?? '',
                }}
                onCancel={() => setEditNoteMode(false)}
                extraRightAction={{ action: deleteNoteAction, name: 'noteId', value: note.id, label: 'Удалить' }}
              />
            )}
          </div>
        </div>
      )}

      {/* ==== NEW NOTE ==== */}
      {newNote && (
        <div role="dialog" aria-modal className="cal-modal__backdrop" onClick={() => setNewNote(null)}>
          <div className="cal-modal glass" onClick={(e) => e.stopPropagation()}>
            <header className="cal-modal__header">
              <div className="cal-modal__title"><strong>Новая заметка</strong></div>
              <button className="cal-close" onClick={() => setNewNote(null)} aria-label="Закрыть">×</button>
            </header>

            <NoteForm
              mode="create"
              submitLabel="Сохранить"
              action={createNoteAction}
              defaults={{
                dateISO: newNote.atISO,
                allDay: newNote.allDay,
                title: '',
                text: '',
              }}
              onCancel={() => setNewNote(null)}
            />
          </div>
        </div>
      )}

      {/* ===== СТИЛИ (scoped) ===== */}
      <style jsx>{`
        .cal-modal__backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.32); display: grid; place-items: center; z-index: 1000; padding: 12px; }
        .cal-modal { width: min(880px, 96vw); max-width: 96vw; max-height: 92svh; overflow: auto; background:#fff; border:1px solid #e5e7eb; border-radius: 16px; box-shadow: 0 12px 32px rgba(0,0,0,.18); padding: 12px; }
        .glass { background: var(--glass-top); backdrop-filter: saturate(180%) blur(12px); -webkit-backdrop-filter: saturate(180%) blur(12px); border:1px solid var(--glass-brd); }
        @media (max-width: 520px) { .cal-modal { width: 100vw; height: 100svh; max-height: 100svh; border-radius: 0; border: none; } }

        .cal-modal__header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .cal-modal__title { display:flex; align-items:center; gap:8px; font-weight:800; }
        .cal-close { border:1px solid var(--glass-brd); background:#fff; border-radius:8px; width:28px; height:28px; cursor:pointer; }

        .badge { font-size:10px; border-radius:999px; padding:0 6px; }
        .badge--urgent { color:#fff; background:#8d2828; }

        .cal-modal__meta { display:flex; gap:12px; font-size:12px; color:#374151; margin:6px 0 10px; flex-wrap:wrap; }

        .wb { word-break: break-word; overflow-wrap: anywhere; white-space: pre-wrap; }
        .clamp1 { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }

        .scrollbox       { max-height: 60vh; overflow: auto; padding: 10px; background:#fafafa; border:1px solid #f3f4f6; border-radius: 8px; }
        .scrollbox-inner { max-height: 50vh; overflow: auto; padding: 10px; background: rgba(255,255,255,.65); border:1px solid rgba(0,0,0,.06); border-radius: 8px; }

        .cal-modal__desc { margin-bottom:10px; }
        .cal-modal__desc--empty { color:#6b7280; font-style:italic; }
        .muted { color:#6b7280; font-size:12px; }

        /* компактные карточки в модалке дня */
        .day-list { display:grid; gap:8px; }
        .day-item { display: grid; grid-template-columns: 1fr auto; align-items: stretch; border-radius: 12px; border: 1px solid #e5e7eb; background: #fff; overflow: hidden; transition: box-shadow .16s ease, border-color .16s ease, background .16s ease, transform .16s ease; }
        .day-item:hover { border-color: rgba(141,40,40,.35); box-shadow: 0 6px 16px rgba(0,0,0,.08); background: linear-gradient(180deg, rgba(141,40,40,.06), rgba(141,40,40,.02)), #fff; transform: translateY(-1px); }
        .day-item--task { background: #FEF9E7; border-color: #F59E0B; }
        .day-item--urgent { border-left: 3px solid #8d2828; }
        .day-item--note  { background: #F0F7FF; border-color: #60a5fa; }

        .day-item__main { text-align: left; padding: 8px 10px; background: transparent; border: 0; cursor: pointer; min-width: 0; }
        .day-item__main--compact { padding: 6px 8px; }
        .day-item__title { font-size:13px; font-weight:700; display:flex; align-items:center; gap:8px; margin-bottom:2px; }
        .day-item__kicker { font-size:12px; color:#374151; opacity:.9; }
        .day-item__disclosure { width: 40px; padding: 0 8px; border: 0; cursor: pointer; background: transparent; border-left: 1px solid rgba(0,0,0,.06); font-size: 14px; }
        .day-item__details { grid-column: 1 / -1; display: grid; gap: 6px; padding: 8px 10px 10px; background: rgba(255,255,255,.65); border-top: 1px solid rgba(0,0,0,.06); }
        .note-details { background: rgba(219,234,254,.45); }
        .day-item__meta { font-size:12px; color:#374151; display:flex; gap:8px; flex-wrap:wrap; }
        .day-item__desc { font-size:12px; color:#111827; line-height:1.45; }

        /* локальные классы формы (на всякий случай) */
        .form-root { display: grid; gap: 10px; }
        .form-grid-2 { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
        .span-2 { grid-column: 1 / -1; }
        .label { display:grid; gap:6px; font-size:12px; color:#374151; }
        .label__text { font-weight: 600; color:#111827; }
        .label-inline { display:flex; gap:8px; align-items:center; font-size:12px; color:#374151; }
        .input, .textarea { width: 100%; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; color: #111827; font-size: 13px; outline: none; transition: border-color .12s ease, box-shadow .12s ease; }
        .textarea { resize: vertical; min-height: 140px; }
        .input:focus, .textarea:focus { border-color: #8d2828; box-shadow: 0 0 0 3px rgba(141,40,40,.12); }
        .input:disabled { background:#f3f4f6; color:#6b7280; cursor:not-allowed; }
        .time-row { display:flex; gap:10px; align-items:center; }
        .checkbox { width: 16px; height: 16px; accent-color: #8d2828; }

        .btn { height: 32px; padding: 0 12px; border-radius: 10px; font-size: 13px; cursor: pointer; }
        .btn--primary { border: 1px solid #111827; background: #111827; color: #fff; }
        .btn--ghost { border: 1px solid #e5e7eb; background: #fff; color: #111827; }
        .btn--danger { border: 1px solid #ef4444; background: #ef4444; color: #fff; }

        .day-filter { display:flex; gap:6px; margin: 4px 0 10px; }
        .tab { height: 28px; padding: 0 10px; border-radius: 999px; border: 1px solid #e5e7eb; background:#fff; font-size:12px; cursor:pointer; }
        .tab--active { background:#111827; border-color:#111827; color:#fff; }

        .actions { display:flex; gap:8px; margin-top: 4px; }
      `}</style>

      {/* ===== ГЛОБАЛЬНЫЕ стили для NoteForm (чтобы работали внутри дочернего компонента) ===== */}
      <style jsx global>{`
        .cal-modal .form-root { display: grid; gap: 10px; }
        .cal-modal .form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .cal-modal .span-2 { grid-column: 1 / -1; }

        .cal-modal .label { display: grid; gap: 6px; font-size: 12px; color: #374151; }
        .cal-modal .label__text { font-weight: 600; color: #111827; }
        .cal-modal .label-inline { display: flex; gap: 8px; align-items: center; font-size: 12px; color: #374151; }

        .cal-modal .input,
        .cal-modal .textarea {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #fff;
          color: #111827;
          font-size: 13px;
          outline: none;
          transition: border-color .12s ease, box-shadow .12s ease;
        }
        .cal-modal .textarea { resize: vertical; min-height: 140px; }
        .cal-modal .input:focus,
        .cal-modal .textarea:focus {
          border-color: #8d2828;
          box-shadow: 0 0 0 3px rgba(141,40,40,.12);
        }
        .cal-modal .input:disabled { background:#f3f4f6; color:#6b7280; cursor:not-allowed; }

        .cal-modal .time-row { display: flex; gap: 10px; align-items: center; }
        .cal-modal .checkbox { width: 16px; height: 16px; accent-color: #8d2828; }

        .cal-modal .actions { display:flex; gap:8px; margin-top:4px; }
        .cal-modal .btn { height: 32px; padding: 0 12px; border-radius: 10px; font-size: 13px; cursor: pointer; }
        .cal-modal .btn--primary { border:1px solid #111827; background:#111827; color:#fff; }
        .cal-modal .btn--ghost { border:1px solid #e5e7eb; background:#fff; color:#111827; }
        .cal-modal .btn--danger { border:1px solid #ef4444; background:#ef4444; color:#fff; }
      `}</style>
    </>,
    document.body
  );

  function closeAll() {
    setTaskId(null);
    setDayIso(null);
    setNoteId(null);
    setNewNote(null);
    setExpanded(new Set());
    setEditNoteMode(false);
    setDayFilter('all');
  }

  function tabCls(active: boolean) {
    return `tab ${active ? 'tab--active' : ''}`;
  }
}

/** ===== helpers ===== */
function fmtRu(dOrIso: string | Date) {
  const d = typeof dOrIso === 'string' ? new Date(dOrIso) : dOrIso;
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(d).replace('.', '');
}
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function truncate(s: string, max = 140) { const clean = s.trim().replace(/\s+/g, ' '); return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + '…'; }
function sortTasks(a: Task, b: Task) {
  const ap = (a.priority ?? 'normal') === 'high' ? 0 : 1;
  const bp = (b.priority ?? 'normal') === 'high' ? 0 : 1;
  if (ap !== bp) return ap - bp;
  return (a.title || '').localeCompare(b.title || '', 'ru');
}

/** ==== Универсальная форма заметки (без вложенных form) ==== */
function NoteForm(props: {
  mode: 'create' | 'edit';
  submitLabel: string;
  action: (formData: FormData) => Promise<void>;
  defaults: {
    noteId?: string;
    dateISO: string;
    allDay: boolean;
    title: string;
    text: string;
  };
  onCancel: () => void;
  extraRightAction?: { action: (formData: FormData) => Promise<void>, name: string, value: string, label: string };
}) {
  const at = new Date(props.defaults.dateISO);
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');

  const [allDay, setAllDay] = useState<boolean>(props.defaults.allDay);
  const formId = `note-form-${props.mode}-${props.defaults.noteId ?? 'new'}`;

  return (
    <>
      <form id={formId} action={props.action} className="form-root">
        {props.mode === 'edit' && (
          <input type="hidden" name="noteId" value={props.defaults.noteId} />
        )}

        <div className="form-grid-2">
          <label className="label">
            <span className="label__text">Дата</span>
            <input name="date" type="date" defaultValue={`${y}-${m}-${d}`} required className="input" />
          </label>

          <div className="label">
            <span className="label__text">Время</span>
            <div className="time-row">
              <input
                name="time"
                type="time"
                className="input"
                disabled={allDay}
                defaultValue={props.defaults.allDay ? '' : `${hh}:${mm}`}
                placeholder="чч:мм"
              />
              <label className="label-inline">
                <input
                  name="allDay"
                  type="checkbox"
                  defaultChecked={props.defaults.allDay}
                  onChange={(e) => setAllDay(e.currentTarget.checked)}
                  className="checkbox"
                />
                Весь день
              </label>
            </div>
          </div>

          <label className="label span-2">
            <span className="label__text">Заголовок</span>
            <input
              name="title"
              type="text"
              defaultValue={props.defaults.title}
              placeholder="необязательно"
              className="input"
            />
          </label>

          <label className="label span-2">
            <span className="label__text">Текст</span>
            <textarea
              name="text"
              rows={8}
              defaultValue={props.defaults.text}
              placeholder="Текст заметки..."
              className="textarea"
            />
          </label>
        </div>
      </form>

      <div className="actions">
        <button form={formId} type="submit" className="btn btn--primary">{props.submitLabel}</button>
        <button type="button" className="btn btn--ghost" onClick={props.onCancel}>Отмена</button>

        {props.extraRightAction && (
          <form action={props.extraRightAction.action} style={{ marginLeft: 'auto' }}>
            <input type="hidden" name={props.extraRightAction.name} value={props.extraRightAction.value} />
            <button type="submit" className="btn btn--danger">{props.extraRightAction.label}</button>
          </form>
        )}
      </div>
    </>
  );
}

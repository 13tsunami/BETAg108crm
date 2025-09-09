// app/(app)/calendar/CalendarModals.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import type { NoteLite, AttachmentLite, AssigneeLite } from './page';
import { createNoteAction, updateNoteAction, deleteNoteAction } from './actions';

const BRAND = '#8d2828';

type Task = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string; // ISO
  hidden?: boolean | null;
  priority: 'normal' | 'high' | null;
  createdById: string | null;
  createdByName: string | null;
  attachments: AttachmentLite[];
  assignees: AssigneeLite[];
};

type Props = { tasks: Task[]; meId: string; notes?: NoteLite[] };

export default function CalendarModals({ tasks, meId, notes = [] }: Props) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [dayIso, setDayIso] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);

  // для создания новой заметки
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
    for (const [, arr] of m) {
      arr.sort((a, b) => {
        const ap = (a.priority ?? 'normal') === 'high' ? 0 : 1;
        const bp = (b.priority ?? 'normal') === 'high' ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (a.title || '').localeCompare(b.title || '', 'ru');
      });
    }
    return m;
  }, [tasks]);

  const notesByDay = useMemo(() => {
    const m = new Map<string, NoteLite[]>();
    for (const n of notes) {
      const key = ymd(new Date(n.at));
      (m.get(key) ?? m.set(key, []).get(key)!)!.push(n);
    }
    for (const [, arr] of m) {
      arr.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'ru'));
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
      {/* модалка задачи */}
      {task && (
        <div role="dialog" aria-modal className="cal-modal__backdrop">
          <div className="cal-modal glass" onClick={(e) => e.stopPropagation()}>
            <header className="cal-modal__header">
              <div className="cal-modal__title">
                <strong className="wb">{task.title}</strong>
                {(task.priority ?? 'normal') === 'high' ? <span className="badge badge--urgent">Срочно</span> : null}
              </div>
              <button className="cal-close" onClick={() => setTaskId(null)} aria-label="Закрыть">×</button>
            </header>

            <section className="meta-section">
              <div className="meta-row"><span className="meta-label">Дедлайн</span><span className="meta-val">{fmtRu(task.dueDate)}</span></div>
              {task.createdByName && <div className="meta-row"><span className="meta-label">Назначил</span><span className="meta-val">{task.createdByName}</span></div>}
              {!!task.assignees.length && (
                <div className="meta-row">
                  <span className="meta-label">Кому</span>
                  <span className="meta-val">{renderAssignees(task.assignees)}</span>
                </div>
              )}
              {!!task.attachments.length && (
                <div className="meta-row">
                  <span className="meta-label">Файлы</span>
                  <ul className="files__list meta-val">
                    {task.attachments.map(a => (
                      <li key={a.id} className="file-chip">
                        <a
                          href={`/api/files/${encodeURIComponent(a.name)}`}
                          download={a.originalName ?? undefined}
                          className="file-chip__link"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span className="file-chip__name wb clamp1">{a.originalName || a.name}</span>
                          <span className="file-chip__meta">{a.mime} · {fmtSize(a.size)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {task.description && (
              <section className="meta-section">
                <div className="meta-row">
                  <span className="meta-label">Описание</span>
                  <div className="meta-val"><div className="text-box wb">{task.description}</div></div>
                </div>
              </section>
            )}

            <div style={{ display:'flex', gap:8, marginTop:6 }}>
              <Link href="/inboxtasks" className="btn btn--brand">В задачи</Link>
              <button type="button" className="btn btn--ghost" onClick={() => setTaskId(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {/* модалка дня */}
      {dayIso && (
        <div role="dialog" aria-modal className="cal-modal__backdrop">
          <div className="cal-modal cal-modal--day" onClick={(e) => e.stopPropagation()}>
            <header className="cal-modal__header">
              <div className="cal-modal__title"><strong>За {fmtRu(dayIso)}</strong></div>
              <button className="cal-close" onClick={() => setDayIso(null)} aria-label="Закрыть">×</button>
            </header>

            <div className="day-filter" role="tablist" aria-label="Фильтр содержимого дня">
              <button role="tab" aria-selected={dayFilter === 'all'}   className={tabCls(dayFilter === 'all')}   onClick={() => setDayFilter('all')}>Все</button>
              <button role="tab" aria-selected={dayFilter === 'tasks'} className={tabCls(dayFilter === 'tasks')} onClick={() => setDayFilter('tasks')}>Задачи</button>
              <button role="tab" aria-selected={dayFilter === 'notes'} className={tabCls(dayFilter === 'notes')} onClick={() => setDayFilter('notes')}>Заметки</button>
            </div>

            {(filteredDayTasks.length === 0 && filteredDayNotes.length === 0) ? (
              <div className="muted">Пусто</div>
            ) : (
              <div className="tiles">
                {filteredDayTasks.sort(sortTasks).map(t => {
                  const urgent = (t.priority ?? 'normal') === 'high';
                  const key = `t:${t.id}`;
                  const isOpen = expanded.has(key);
                  return (
                    <article key={t.id} className={`tile tile--task ${urgent ? 'tile--urgent' : ''} ${isOpen ? 'tile--open' : ''}`}>
                      <header className="tile__hdr" onClick={() => toggle(key)}>
                        <div className="tile__ttl wb clamp2">{t.title}</div>
                        <button className="tile__chev" aria-expanded={isOpen} aria-label={isOpen ? 'Свернуть' : 'Развернуть'}>
                          {isOpen ? '▴' : '▾'}
                        </button>
                      </header>

                      <div className="tile__meta-inline">
                        <span>{fmtRu(t.dueDate)}</span>
                        {t.createdByName ? <span>· {t.createdByName}</span> : null}
                        {!!t.assignees.length && <span>· Адресаты: {t.assignees.length}</span>}
                        {!!t.attachments.length && <span>· Файлы: {t.attachments.length}</span>}
                      </div>

                      {isOpen && (
                        <>
                          <section className="meta-section">
                            <div className="meta-row"><span className="meta-label">Дедлайн</span><span className="meta-val">{fmtRu(t.dueDate)}</span></div>
                            {t.createdByName && <div className="meta-row"><span className="meta-label">Назначил</span><span className="meta-val">{t.createdByName}</span></div>}
                            {!!t.assignees.length && (
                              <div className="meta-row">
                                <span className="meta-label">Кому</span>
                                <span className="meta-val">{renderAssignees(t.assignees)}</span>
                              </div>
                            )}
                            {!!t.attachments.length && (
                              <div className="meta-row">
                                <span className="meta-label">Файлы</span>
                                <ul className="files__list">
                                  {t.attachments.map(a => (
                                    <li key={a.id}>
                                      <a
                                        href={`/api/files/${encodeURIComponent(a.name)}`}
                                        download={a.originalName ?? undefined}
                                        className="file-chip__link"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <span className="file-chip__name wb clamp1">{a.originalName || a.name}</span>
                                        <span className="file-chip__meta">{fmtSize(a.size)}</span>
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </section>

                          {t.description && (
                            <section className="meta-section">
                              <div className="meta-row">
                                <span className="meta-label">Описание</span>
                                <div className="meta-val"><div className="text-box wb">{t.description}</div></div>
                              </div>
                            </section>
                          )}

                          <div style={{ display:'flex', gap:8 }}>
                            <Link href="/inboxtasks" className="btn btn--brand">Открыть задачу</Link>
                            <button type="button" className="btn btn--ghost" onClick={() => { setDayIso(null); setTaskId(t.id); }}>Подробнее</button>
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}

                {filteredDayNotes.map(n => {
                  const key = `n:${n.id}`;
                  const isOpen = expanded.has(key);
                  return (
                    <article key={n.id} className={`tile tile--note ${isOpen ? 'tile--open' : ''}`}>
                      <header className="tile__hdr" onClick={() => toggle(key)}>
                        <div className="tile__ttl wb clamp2">{n.title ?? 'Заметка'}</div>
                        <button className="tile__chev" aria-expanded={isOpen}>{isOpen ? '▴' : '▾'}</button>
                      </header>
                      <div className="tile__meta-inline">
                        <span>{n.allDay ? 'Весь день' : 'Время'}</span>
                        <span>· {fmtRu(n.at)}</span>
                      </div>

                      {isOpen && (
                        <>
                          <section className="meta-section">
                            <div className="meta-row">
                              <span className="meta-label">Текст</span>
                              <div className="meta-val"><div className="text-box wb">{n.text}</div></div>
                            </div>
                          </section>

                          <div style={{ display:'flex', gap:8, marginTop:6 }}>
                            <button type="button" className="btn btn--brand" onClick={() => { setDayIso(null); setNoteId(n.id); setEditNoteMode(true); }}>Редактировать</button>
                            <form action={deleteNoteAction}>
                              <input type="hidden" name="noteId" value={n.id} />
                              <button type="submit" className="btn btn--danger">Удалить</button>
                            </form>
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* модалка существующей заметки */}
      {note && (
        <div role="dialog" aria-modal className="cal-modal__backdrop">
          <div className="cal-modal glass" onClick={(e) => e.stopPropagation()}>
            <header className="cal-modal__header">
              <div className="cal-modal__title"><strong className="wb">{editNoteMode ? 'Редактировать заметку' : (note.title ?? 'Заметка')}</strong></div>
              <button className="cal-close" onClick={() => setNoteId(null)} aria-label="Закрыть">×</button>
            </header>

            {!editNoteMode ? (
              <>
                <section className="meta-section">
                  <div className="meta-row"><span className="meta-label">Когда</span><span className="meta-val">{note.allDay ? 'Весь день' : 'Время'} · {fmtRu(note.at)}</span></div>
                </section>
                {note.text && (
                  <section className="meta-section">
                    <div className="meta-row">
                      <span className="meta-label">Текст</span>
                      <div className="meta-val"><div className="text-box wb">{note.text}</div></div>
                    </div>
                  </section>
                )}
                <div style={{ display:'flex', gap:8 }}>
                  <button type="button" className="btn btn--brand" onClick={() => setEditNoteMode(true)}>Редактировать</button>
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

      {/* модалка НОВОЙ заметки */}
      {newNote && (
        <div role="dialog" aria-modal className="cal-modal__backdrop">
          <div className="cal-modal glass" onClick={(e) => e.stopPropagation()}>
            <header className="cal-modal__header">
              <div className="cal-modal__title"><strong className="wb">Новая заметка</strong></div>
              <button className="cal-close" onClick={() => setNewNote(null)} aria-label="Закрыть">×</button>
            </header>

            <NoteForm
              mode="create"
              submitLabel="Создать"
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

      {/* styles — глобально, но строго в пределах .cal-modal, чтобы не ломать сайдбар */}
      <style jsx global>{`
        :root { --brand: ${BRAND}; --tile-w: 180px; --tile-h: 120px; }

        .cal-modal__backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.32); display: grid; place-items: center; z-index: 1000; padding: 12px; }
        .cal-modal { width: min(1100px, 96vw); max-width: 96vw; max-height: 92svh; overflow: auto; background:#fff; border:1px solid #e5e7eb; border-radius: 16px; box-shadow: 0 12px 32px rgba(0,0,0,.18); padding: 12px; }
        .cal-modal--day { height: 84svh; max-height: 84svh; display: flex; flex-direction: column; overflow: hidden; }
        .glass { background: var(--glass-top, #fff); backdrop-filter: saturate(180%) blur(12px); -webkit-backdrop-filter: saturate(180%) blur(12px); border:1px solid var(--glass-brd, #e5e7eb); }
        @media (max-width: 520px) {
          .cal-modal { width: 100vw; height: 100svh; max-height: 100svh; border-radius: 0; border: none; }
          .cal-modal--day { width: 100vw; height: 100svh; max-height: 100svh; }
        }

        .cal-modal .cal-modal__header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .cal-modal .cal-modal__title { display:flex; align-items:center; gap:8px; font-weight:800; }
        .cal-modal .cal-close { border:1px solid var(--glass-brd, #e5e7eb); background:#fff; border-radius:8px; width:28px; height:28px; cursor:pointer; }

        .cal-modal .badge { font-size:10px; border-radius:999px; padding:0 6px; }
        .cal-modal .badge--urgent { color:#fff; background: var(--brand); }

        .cal-modal .wb { word-break: break-word; overflow-wrap: anywhere; white-space: pre-wrap; }
        .cal-modal .clamp1 { display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; }
        .cal-modal .clamp2 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .cal-modal .muted { color:#6b7280; font-size:12px; }

        .cal-modal .day-filter { display:flex; gap:6px; margin: 4px 0 10px; }

        /* кнопки — только внутри модалки */
        .cal-modal .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 34px;
          padding: 0 14px;
          border-radius: 10px;
          font-size: 13px;
          line-height: 1;
          font-weight: 600;
          cursor: pointer;
          transition: filter .12s ease, background-color .12s ease, border-color .12s ease, box-shadow .12s ease;
        }
        .cal-modal .btn--brand  { background: var(--brand); border: 1px solid var(--brand); color: #fff !important; box-shadow: 0 1px 0 rgba(0,0,0,.05); }
        .cal-modal .btn--brand:hover  { filter: brightness(1.05); }
        .cal-modal .btn--brand:active { filter: brightness(.95); }

        .cal-modal .btn--ghost  { border: 1px solid #e5e7eb; background: #fff; color: #111827; }
        .cal-modal .btn--ghost:hover  { background: #f7f7f7; }

        .cal-modal .btn--danger { border: 1px solid #ef4444; background: #ef4444; color: #fff; }
        .cal-modal .btn--danger:hover  { filter: brightness(1.05); }
        .cal-modal .btn--danger:active { filter: brightness(.95); }

        /* сетка плиток — только в модалке дня */
        .cal-modal .tiles {
          display: grid;
          grid-auto-flow: dense;
          grid-template-columns: repeat(auto-fill, minmax(var(--tile-w), 1fr));
          gap: 8px;
          padding-right: 4px;
          overflow: auto;
          flex: 1;
          align-content: start;
        }
        .cal-modal .tiles::-webkit-scrollbar { width: 8px; height: 8px; }
        .cal-modal .tiles::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 8px; }
        .cal-modal .tiles:hover::-webkit-scrollbar-thumb { background: #d1d5db; }

        .cal-modal .tile {
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          background: #fff;
          padding: 10px;
          display: grid;
          gap: 6px;
          transition: box-shadow .16s ease, border-color .16s ease, background .16s ease, transform .16s ease;
          width: 100%;
          height: var(--tile-h);
          overflow: hidden;
        }
        .cal-modal .tile--task { background: #FEF9E7; border-color: #F59E0B; }
        .cal-modal .tile--note  { background: #F0F7FF; border-color: #60a5fa; }
        .cal-modal .tile--urgent { box-shadow: inset 3px 0 0 var(--brand); }
        .cal-modal .tile--open { grid-column: 1 / -1; height: auto; align-self: start; border-radius: 14px; }

        .cal-modal .tile__hdr { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; cursor: pointer; }
        .cal-modal .tile__ttl { font-size: 13px; font-weight: 800; line-height: 1.2; }
        .cal-modal .tile__chev { border: 0; background: transparent; font-size: 14px; padding: 0 2px; cursor: pointer; }
        .cal-modal .tile__meta-inline { display:flex; gap:8px; flex-wrap:wrap; font-size:12px; color:#6b7280; }

        /* метаданные */
        .cal-modal .meta-section {
          border: 1px solid var(--brand);
          border-radius: 12px;
          padding: 10px;
          background: #fff;
          display: grid;
          gap: 8px;
        }
        .cal-modal .meta-row   { display:flex; gap:10px; align-items:flex-start; }
        .cal-modal .meta-label { width: 110px; flex:none; font-size: 12px; font-weight: 700; color: #111; padding-top: 3px; }
        .cal-modal .meta-val   { display:flex; flex-wrap:wrap; gap:6px; font-size: 13px; color: #111827; }

        .cal-modal .text-box { background:#fafafa; border:1px solid #f3f4f6; border-radius: 10px; padding: 8px 10px; max-height: 40vh; overflow: auto; }

        .cal-modal .assignees { display:flex; flex-wrap:wrap; gap:6px; }
        .cal-modal .chip { border:1px solid #e5e7eb; background:#fff; border-radius:999px; padding:2px 8px; font-size:12px; }

        .cal-modal .files__list { display:flex; flex-wrap:wrap; gap:6px; margin:0; padding:0; list-style:none; }
        .cal-modal .file-chip__link { display:inline-grid; grid-template-columns:auto auto; align-items:center; gap:6px; border:1px solid #e5e7eb; border-radius:999px; padding:4px 10px; text-decoration:none; background:#fff; }
        .cal-modal .file-chip__link:hover { border-color:#cbd5e1; }
        .cal-modal .file-chip__name { font-weight:600; }
        .cal-modal .file-chip__meta { font-size:12px; color:#6b7280; }
      `}</style>
    </>,
    document.body
  );

  function toggle(key: string) {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpanded(next);
  }
  function closeAll() {
    setTaskId(null); setDayIso(null); setNoteId(null); setNewNote(null);
    setExpanded(new Set()); setEditNoteMode(false); setDayFilter('all');
  }
  function tabCls(active: boolean) { return `btn ${active ? 'btn--brand' : 'btn--ghost'}`; }
  function renderAssignees(list: AssigneeLite[]) {
    if (list.length <= 7) return list.map(a => <span key={a.id} className="chip">{a.name ?? 'Без имени'}</span>);
    const first = list.slice(0, 7); const rest = list.length - 7;
    return (<>{first.map(a => <span key={a.id} className="chip">{a.name ?? 'Без имени'}</span>)}<span className="chip">+{rest}</span></>);
  }
}

/* helpers */
function fmtRu(dOrIso: string | Date) {
  const d = typeof dOrIso === 'string' ? new Date(dOrIso) : dOrIso;
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(d).replace('.', '');
}
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function sortTasks(a: Task, b: Task) {
  const ap = (a.priority ?? 'normal') === 'high' ? 0 : 1;
  const bp = (b.priority ?? 'normal') === 'high' ? 0 : 1;
  if (ap !== bp) return ap - bp;
  return (a.title || '').localeCompare(b.title || '', 'ru');
}
function fmtSize(n: number) {
  if (!Number.isFinite(n) || n < 0) return '';
  const k = 1024;
  if (n < k) return `${n} B`;
  const units = ['KB','MB','GB','TB'];
  let i = -1; let val = n;
  do { val /= k; i++; } while (val >= k && i < units.length - 1);
  const s = Math.round(val * 10) / 10;
  return `${s} ${units[i]}`;
}

/* форма заметки */
function NoteForm(props: {
  mode: 'create' | 'edit';
  submitLabel: string;
  action: (formData: FormData) => Promise<void>;
  defaults: { noteId?: string; dateISO: string; allDay: boolean; title: string; text: string; };
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
        {props.mode === 'edit' && <input type="hidden" name="noteId" value={props.defaults.noteId} />}

        <div className="form-grid-2">
          <label className="label">
            <span className="label__text">Дата</span>
            <input name="date" type="date" defaultValue={`${y}-${m}-${d}`} required className="input" />
          </label>

          <div className="label">
            <span className="label__text">Время</span>
            <div className="time-row">
              <input name="time" type="time" className="input" disabled={allDay} defaultValue={props.defaults.allDay ? '' : `${hh}:${mm}`} placeholder="чч:мм" />
              <label className="label-inline">
                <input name="allDay" type="checkbox" defaultChecked={props.defaults.allDay} onChange={(e) => setAllDay(e.currentTarget.checked)} className="checkbox" />
                Весь день
              </label>
            </div>
          </div>

          <label className="label span-2">
            <span className="label__text">Заголовок</span>
            <input name="title" type="text" defaultValue={props.defaults.title} placeholder="необязательно" className="input" />
          </label>

          <label className="label span-2">
            <span className="label__text">Текст</span>
            <textarea name="text" rows={8} defaultValue={props.defaults.text} placeholder="Текст заметки..." className="textarea" />
          </label>
        </div>
      </form>

      <div className="actions">
        <button form={formId} type="submit" className="btn btn--brand">{props.submitLabel}</button>
        <button type="button" className="btn btn--ghost" onClick={props.onCancel}>Отмена</button>

        {props.extraRightAction && (
          <form action={props.extraRightAction.action} style={{ marginLeft: 'auto' }}>
            <input type="hidden" name={props.extraRightAction.name} value={props.extraRightAction.value} />
            <button type="submit" className="btn btn--danger">{props.extraRightAction.label}</button>
          </form>
        )}
      </div>

      <style jsx>{`
        .form-root { display: grid; gap: 10px; }
        .form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .span-2 { grid-column: 1 / -1; }
        .label { display: grid; gap: 6px; font-size: 12px; color: #374151; }
        .label__text { font-weight: 600; color: #111827; }
        .label-inline { display: flex; gap: 8px; align-items: center; font-size: 12px; color: #374151; }
        .input, .textarea { width: 100%; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; color: #111827; font-size: 13px; outline: none; transition: border-color .12s ease, box-shadow .12s ease; }
        .textarea { resize: vertical; min-height: 140px; }
        .input:focus, .textarea:focus { border-color: ${BRAND}; box-shadow: 0 0 0 3px rgba(141,40,40,.12); }
        .input:disabled { background:#f3f4f6; color:#6b7280; cursor:not-allowed; }
        .time-row { display: flex; gap: 10px; align-items: center; }
        .checkbox { width: 16px; height: 16px; accent-color: ${BRAND}; }
        .actions { display:flex; gap:8px; margin-top:4px; }
      `}</style>
    </>
  );
}

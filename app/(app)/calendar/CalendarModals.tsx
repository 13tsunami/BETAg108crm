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

  const [newNote, setNewNote] = useState<{ at: string; allDay: boolean } | null>(null);

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
      const raw = (n as any).at ?? (n as any).atISO ?? (n as any).date ?? (n as any).dateISO ?? '';
      const key = raw ? ymd(new Date(raw)) : 'invalid';
      (m.get(key) ?? m.set(key, []).get(key)!)!.push(n);
    }
    for (const [, arr] of m) {
      arr.sort((a, b) => ((a.title ?? '') as string).localeCompare((b.title ?? '') as string, 'ru'));
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
      const detail = (e as CustomEvent).detail as { at?: string; atISO?: string; dateISO?: string; allDay?: boolean } | undefined;
      const at = detail?.at ?? detail?.atISO ?? detail?.dateISO ?? new Date().toISOString();
      const alld = detail?.allDay ?? true;
      setNewNote({ at, allDay: alld });
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

      {dayIso && (
        <div role="dialog" aria-modal className="cal-modal__backdrop">
          <div className="cal-modal cal-modal--day glass" onClick={(e) => e.stopPropagation()}>
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
                  const raw = (n as any).at ?? (n as any).atISO ?? (n as any).date ?? (n as any).dateISO ?? '';
                  return (
                    <article key={n.id} className={`tile tile--note ${isOpen ? 'tile--open' : ''}`}>
                      <header className="tile__hdr" onClick={() => toggle(key)}>
                        <div className="tile__ttl wb clamp2">{n.title ?? 'Заметка'}</div>
                        <button className="tile__chev" aria-expanded={isOpen}>{isOpen ? '▴' : '▾'}</button>
                      </header>
                      <div className="tile__meta-inline">
                        <span>{(n as any).allDay ? 'Весь день' : 'Время'}</span>
                        <span>· {raw ? fmtRu(raw) : ''}</span>
                      </div>

                      {isOpen && (
                        <>
                          <section className="meta-section">
                            <div className="meta-row">
                              <span className="meta-label">Текст</span>
                              <div className="meta-val"><div className="text-box wb">{(n as any).text ?? (n as any).content ?? ''}</div></div>
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
                  <div className="meta-row"><span className="meta-label">Когда</span><span className="meta-val">{(note as any).allDay ? 'Весь день' : 'Время'} · {fmtRu((note as any).at ?? (note as any).atISO ?? (note as any).date ?? (note as any).dateISO ?? '')}</span></div>
                </section>
                {(note as any).text && (
                  <section className="meta-section">
                    <div className="meta-row">
                      <span className="meta-label">Текст</span>
                      <div className="meta-val"><div className="text-box wb">{(note as any).text}</div></div>
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
                  dateISO: (note as any).at ?? (note as any).atISO ?? (note as any).date ?? (note as any).dateISO ?? new Date().toISOString(),
                  allDay: !!(note as any).allDay,
                  title: note.title ?? '',
                  text: (note as any).text ?? (note as any).content ?? '',
                }}
                onCancel={() => setEditNoteMode(false)}
                extraRightAction={{ action: deleteNoteAction, name: 'noteId', value: note.id, label: 'Удалить' }}
              />
            )}
          </div>
        </div>
      )}

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
                dateISO: newNote.at,
                allDay: newNote.allDay,
                title: '',
                text: '',
              }}
              onCancel={() => setNewNote(null)}
            />
          </div>
        </div>
      )}

      <style jsx global>{`
        :root {
          --brand: ${BRAND};
          --tile-w: 180px;
          --tile-h: 120px;

          /* подгон под sign-in визуал */
          --glass-bg: rgba(255,255,255,0.75);
          --glass-brd: rgba(141,40,40,0.25);
          --glass-blur: blur(10px);
          --glass-shadow: 0 10px 30px rgba(17,24,39,0.10), inset 0 1px 0 rgba(255,255,255,0.6);
          --btn-shadow: 0 6px 14px rgba(141,40,40,0.25);
          --btn-shadow-hover: 0 10px 18px rgba(141,40,40,0.28);
        }

        .cal-modal__backdrop {
          position: fixed; inset: 0;
          background: rgba(15,23,42,.32);
          display: grid; place-items: center;
          z-index: 1000; padding: 12px;
        }

        .cal-modal {
          width: min(1100px, 96vw);
          max-width: 96vw;
          max-height: 92svh;
          overflow: auto;
          border-radius: 16px;
          border: 1px solid var(--glass-brd);
          background: var(--glass-bg);
          -webkit-backdrop-filter: var(--glass-blur);
          backdrop-filter: var(--glass-blur);
          box-shadow: var(--glass-shadow);
          padding: 24px 22px 22px; /* как в sign-in */
        }
        .cal-modal--day { height: 84svh; max-height: 84svh; display: flex; flex-direction: column; overflow: hidden; }

        .glass { /* класс оставлен для совместимости, значения уже учтены выше */ }

        @media (max-width: 520px) {
          .cal-modal { width: 100vw; height: 100svh; max-height: 100svh; border-radius: 0; border: none; }
          .cal-modal--day { width: 100vw; height: 100svh; max-height: 100svh; }
        }

        .cal-modal .cal-modal__header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
        .cal-modal .cal-modal__title { display:flex; align-items:center; gap:8px; font-weight:800; }
        .cal-modal .cal-close {
          border:1px solid var(--glass-brd);
          background: rgba(255,255,255,0.9);
          border-radius:8px; width:32px; height:32px; cursor:pointer;
          transition: box-shadow .12s ease, transform .04s ease;
        }
        .cal-modal .cal-close:hover { transform: translateY(-1px); box-shadow: var(--btn-shadow-hover); }
        .cal-modal .cal-close:active { transform: translateY(0); box-shadow: var(--btn-shadow); }

        .cal-modal .badge { font-size:10px; border-radius:999px; padding:0 6px; }
        .cal-modal .badge--urgent { color:#fff; background: var(--brand); }

        .cal-modal .wb { word-break: break-word; overflow-wrap: anywhere; white-space: pre-wrap; }
        .cal-modal .clamp1 { display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; }
        .cal-modal .clamp2 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .cal-modal .muted { color:#6b7280; font-size:12px; }

        .cal-modal .day-filter { display:flex; gap:6px; margin: 4px 0 14px; }

        /* кнопки под стиль sign-in */
        .cal-modal .btn {
          display: inline-flex; align-items: center; justify-content: center;
          height: 42px; /* как .signin-btn */
          padding: 0 16px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: .2px;
          cursor: pointer;
          transition: transform .04s ease, box-shadow .12s ease, opacity .2s ease, filter .12s ease, background-color .12s ease, border-color .12s ease;
        }
        .cal-modal .btn--brand  {
          background: var(--brand);
          border: 1px solid var(--brand);
          color: #fff !important;
          box-shadow: var(--btn-shadow);
        }
        .cal-modal .btn--brand:hover  { transform: translateY(-1px); box-shadow: var(--btn-shadow-hover); filter: brightness(1.02); }
        .cal-modal .btn--brand:active { transform: translateY(0); box-shadow: var(--btn-shadow); filter: none; }

        .cal-modal .btn--ghost  {
          border: 1px solid #e5e7eb;
          background: rgba(255,255,255,0.9);
          color: #111827;
        }
        .cal-modal .btn--ghost:hover  { background: #fff; box-shadow: 0 6px 14px rgba(17,24,39,0.08); transform: translateY(-1px); }
        .cal-modal .btn--ghost:active { transform: translateY(0); box-shadow: 0 6px 14px rgba(17,24,39,0.08); }

        .cal-modal .btn--danger {
          border: 1px solid #ef4444;
          background: #ef4444;
          color: #fff;
          box-shadow: 0 6px 14px rgba(239,68,68,0.25);
        }
        .cal-modal .btn--danger:hover  { transform: translateY(-1px); box-shadow: 0 10px 18px rgba(239,68,68,0.28); }
        .cal-modal .btn--danger:active { transform: translateY(0); }

        /* сетка плиток */
        .cal-modal .tiles {
          display: grid;
          grid-auto-flow: row;
          grid-template-columns: repeat(auto-fill, minmax(var(--tile-w), 1fr));
          grid-auto-rows: minmax(var(--tile-h), auto);
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
        /* заметки — ровно #aeffab + аккуратная граница, чтобы читалось */
        .cal-modal .tile--note  { background: #aeffab; border-color: #86e182; }
        .cal-modal .tile--urgent { box-shadow: inset 3px 0 0 var(--brand); }
        .cal-modal .tile--open { grid-column: 1 / -1; height: auto; align-self: start; border-radius: 14px; position: relative; z-index: 2; }

        .cal-modal .tile__hdr { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; cursor: pointer; }
        .cal-modal .tile__ttl { font-size: 13px; font-weight: 800; line-height: 1.2; }
        .cal-modal .tile__chev { border: 0; background: transparent; font-size: 14px; padding: 0 2px; cursor: pointer; }
        .cal-modal .tile__meta-inline { display:flex; gap:8px; flex-wrap:wrap; font-size:12px; color:#374151; }

        /* метаданные */
        .cal-modal .meta-section {
          border: 1px solid var(--glass-brd);
          border-radius: 12px;
          padding: 10px;
          background: rgba(255,255,255,0.9);
          display: grid;
          gap: 8px;
        }
        .cal-modal .meta-row   { display:flex; gap:10px; align-items:flex-start; }
        .cal-modal .meta-label { width: 110px; flex:none; font-size: 12px; font-weight: 700; color: #111; padding-top: 3px; }
        .cal-modal .meta-val   { display:flex; flex-wrap:wrap; gap:6px; font-size: 13px; color: #111827; }

        .cal-modal .text-box {
          background: rgba(250,250,250,0.9);
          border:1px solid #f3f4f6;
          border-radius: 10px;
          padding: 8px 10px;
          max-height: 40vh; overflow: auto;
        }

        .cal-modal .assignees { display:flex; flex-wrap:wrap; gap:6px; }
        .cal-modal .chip { border:1px solid #e5e7eb; background: rgba(255,255,255,0.95); border-radius:999px; padding:2px 8px; font-size:12px; }

        .cal-modal .files__list { display:flex; flex-wrap:wrap; gap:6px; margin:0; padding:0; list-style:none; }
        .cal-modal .file-chip__link {
          display:inline-grid; grid-template-columns:auto auto; align-items:center; gap:6px;
          border:1px solid #e5e7eb; border-radius:999px; padding:4px 10px; text-decoration:none;
          background: rgba(255,255,255,0.9);
          transition: box-shadow .12s ease, border-color .12s ease;
        }
        .cal-modal .file-chip__link:hover { border-color:#cbd5e1; box-shadow: 0 6px 14px rgba(17,24,39,0.08); }
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
        .input, .textarea {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid #e5e7eb;
          border-radius: 12px; /* чуть больше, как в sign-in */
          background: rgba(255,255,255,0.9);
          color: #111827;
          font-size: 13px;
          outline: none;
          transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
        }
        .textarea { resize: vertical; min-height: 140px; }
        .input:focus, .textarea:focus { border-color: ${BRAND}; box-shadow: 0 0 0 3px rgba(141,40,40,0.15); background: #fff; }
        .input:disabled { background:#f3f4f6; color:#6b7280; cursor:not-allowed; }
        .time-row { display: flex; gap: 10px; align-items: center; }
        .checkbox { width: 16px; height: 16px; accent-color: ${BRAND}; }
        .actions { display:flex; gap:8px; margin-top:4px; }
      `}</style>
    </>
  );
}

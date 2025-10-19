'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import type { NoteLite, AttachmentLite, AssigneeLite } from './page';
import { createNoteAction, updateNoteAction, deleteNoteAction } from './actions';
import styles from './CalendarModals.module.css'; // импорт как модуля

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
    <div className={styles.cm}>
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
                <div className="cal-modal__title"><strong className="wb">За {fmtRu(dayIso)}</strong></div>
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
      </>
    </div>,
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
    </>
  );
}

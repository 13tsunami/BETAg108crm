'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFormStatus } from 'react-dom';
import './taskform.css';

/* ===== types (как у вас) ===== */
type SimpleUser  = { id: string; name: string | null; role?: string | null; methodicalGroups?: string | null; subjects?: any };
type SimpleGroup = { id: string; name: string };
type SimpleSubject = { name: string; count?: number };
type Candidate   = { type: 'user' | 'group' | 'role' | 'subject'; id: string; name: string };

type GroupMember = { groupId: string; userId: string };
type SubjectMember = { subjectName: string; userId: string };

const BRAND = '#8d2828';

/* ===== helpers ===== */
const norm = (s?: string | null) => (s ?? '').toLocaleLowerCase('ru-RU').replace(/\s*\+\s*/g, '+').replace(/\s+/g, ' ').trim();
const splitGroups = (s?: string | null) => !s ? [] : s.split(/[,;]+/).map(x => x.trim()).filter(Boolean);

function parseSubjects(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x ?? '').trim()).filter(Boolean);
  const s = String(raw ?? '').trim();
  if (!s) return [];
  if (s.startsWith('[') || s.startsWith('{')) { try { return parseSubjects(JSON.parse(s)); } catch {} }
  return s.split(/[,;\/|]+/g).map((x) => x.trim()).filter(Boolean);
}
function canonicalRole(label?: string | null): string | null {
  const s = norm(label);
  if (s === 'директор' || s === 'director') return 'Директор';
  if (s === 'заместитель+' || s === 'заместитель плюс' || s === 'deputy+' || s === 'deputy_plus') return 'Заместитель+';
  if (s === 'заместитель' || s === 'deputy') return 'Заместитель';
  if (s === 'педагог+' || s === 'teacher+' || s === 'teacher_plus' || s === 'учитель+' || s === 'педагог плюс') return 'Педагог +';
  if (s === 'педагог' || s === 'teacher' || s === 'учитель') return 'Педагог';
  return null;
}
// Екатеринбург, YYYY-MM-DD
const todayYekbYMD = () => {
  const fmt = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Yekaterinburg', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [{ value: day }, , { value: month }, , { value: year }] = fmt.formatToParts(new Date());
  return `${year}-${month}-${day}`;
};

const COLLAPSE_KEY = 'inboxtasks:taskform:collapsed:v1';

/* ===== компонент ===== */
export default function TaskForm({
  users,
  groups,
  subjects,
  groupMembers,
  subjectMembers,
  createAction,                 // server action: Promise<void> с redirect()/revalidatePath()
  allowReviewControls = true,
  initialCollapsed = false,
}: {
  users: SimpleUser[];
  groups: SimpleGroup[];
  subjects: SimpleSubject[];
  groupMembers: GroupMember[];
  subjectMembers: SubjectMember[];
  createAction: (fd: FormData) => Promise<void>;
  allowReviewControls?: boolean;
  initialCollapsed?: boolean;
}) {
  const todayStr = useMemo(() => todayYekbYMD(), []);
  const [due, setDue] = useState(todayStr);
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<'normal'|'high'>('normal');
  const [reviewRequired, setReviewRequired] = useState(false);

  // сворачивание/разворачивание всей формы
  const [collapsedAll, setCollapsedAll] = useState<boolean>(initialCollapsed);
  useEffect(() => {
    try {
      if (collapsedAll) localStorage.setItem(COLLAPSE_KEY, '1');
      else localStorage.removeItem(COLLAPSE_KEY);
    } catch {}
    try {
      const maxAge = 60 * 60 * 24 * 180;
      if (collapsedAll) {
        document.cookie = `inboxtasks_taskform_collapsed=1; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
      } else {
        document.cookie = `inboxtasks_taskform_collapsed=; Path=/; Max-Age=0; SameSite=Lax`;
      }
    } catch {}
  }, [collapsedAll]);

  // роли из users
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    const setR = new Set<string>();
    (users || []).forEach(u => {
      const canon = canonicalRole(u.role);
      if (canon) setR.add(canon);
    });
    setRoles(Array.from(setR).sort((a,b)=>a.localeCompare(b,'ru')).map(n => ({ id: n, name: n })));
  }, [users]);

  // кандидаты и поиск
  const allCandidates = useMemo<Candidate[]>(() => {
    const us: Candidate[] = (users || []).map((u) => ({ type: 'user', id: u.id, name: u.name || u.id }));
    const gs: Candidate[] = (groups || []).map((g) => ({ type: 'group', id: g.id, name: g.name || g.id }));
    const rs: Candidate[] = (roles || []).map((r) => ({ type: 'role', id: r.id, name: r.name }));
    const ss: Candidate[] = (subjects || []).map((s) => ({ type: 'subject', id: s.name, name: s.name }));
    return [...us, ...gs, ...rs, ...ss];
  }, [users, groups, roles, subjects]);

  const [assignees, setAssignees] = useState<Candidate[]>([]);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Candidate[]>([]);
  const [openDd, setOpenDd] = useState(false);

  function runSearch(q: string) {
    setQuery(q);
    const s = q.trim().toLocaleLowerCase('ru-RU');
    if (!s) { setFound([]); return; }
    const sel = new Set(assignees.map((a) => `${a.type}:${a.id}`));
    const res = allCandidates
      .filter((c) => c.name.toLocaleLowerCase('ru-RU').includes(s))
      .filter((c) => !sel.has(`${c.type}:${c.id}`))
      .slice(0, 60);
    setFound(res);
  }
  function addAssignee(a: Candidate) {
    setAssignees((prev) => (prev.some((x) => x.type === a.type && x.id === a.id) ? prev : [...prev, a]));
    setQuery(''); setFound([]); setOpenDd(false);
  }
  function removeAssignee(a: Candidate) {
    setAssignees((prev) => prev.filter((x) => !(x.type === a.type && x.id === a.id)));
  }

  // разворачиваем назначенных в userIds
  async function expandAssigneesToUserIds(): Promise<string[]> {
    const userIds = new Set<string>();

    assignees.filter(a => a.type === 'user').forEach(a => userIds.add(a.id));

    const chosenRoles = assignees.filter(a => a.type === 'role').map(a => canonicalRole(a.id)).filter(Boolean) as string[];
    if (chosenRoles.length) {
      (users || []).forEach(u => {
        const canon = canonicalRole(u.role);
        if (canon && chosenRoles.includes(canon)) userIds.add(u.id);
      });
    }

    const chosenGroups = assignees.filter(a => a.type === 'group').map(g => g.id);
    chosenGroups.forEach(gid => {
      groupMembers.filter(gm => gm.groupId === gid).forEach(gm => userIds.add(gm.userId));
      (users || []).forEach(u => {
        const mg = splitGroups(u.methodicalGroups).map(norm);
        if (mg.includes(norm(gid))) userIds.add(u.id);
      });
    });

    const chosenSubjects = assignees.filter(a => a.type === 'subject').map(a => a.id);
    chosenSubjects.forEach(subj => {
      subjectMembers.filter(sm => sm.subjectName === subj).forEach(sm => userIds.add(sm.userId));
      (users || []).forEach(u => { if (parseSubjects(u.subjects).includes(subj)) userIds.add(u.id); });
    });

    return Array.from(userIds);
  }

  // предпросмотр количества адресатов
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTotal, setPreviewTotal] = useState<number>(0);
  const recomputePreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const ids = await expandAssigneesToUserIds();
      setPreviewTotal(ids.length);
    } finally {
      setPreviewLoading(false);
    }
  }, [assignees, users, groups, groupMembers, subjects, subjectMembers]);
  useEffect(() => { void recomputePreview(); }, [assignees, recomputePreview]);

  // ISO для due (+05:00). Если времени нет — 23:59.
  const dueIso = useMemo(() => {
    if (!due) return '';
    const timePart = (dueTime && /^\d{2}:\d{2}$/.test(dueTime)) ? dueTime : '23:59';
    const d = new Date(`${due}T${timePart}:00+05:00`);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }, [due, dueTime]);

  const isHigh = priority === 'high';

  // файлы
  const [taskFiles, setTaskFiles] = useState<File[]>([]);
  const taskFileInputRef = useRef<HTMLInputElement | null>(null);
  const MAX_TASK_FILES = 12;
  const MAX_BYTES = 50 * 1024 * 1024; // 50 МБ

  const totalBytes = useMemo(
    () => taskFiles.reduce((sum, f) => sum + (f?.size || 0), 0),
    [taskFiles]
  );
  const totalPct = Math.min(totalBytes / MAX_BYTES, 1);
  const totalMbStr = (totalBytes / (1024 * 1024)).toFixed(1);

  const syncTaskInputFiles = useCallback((next: File[]) => {
    setTaskFiles(next);
    const input = taskFileInputRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    next.forEach(ff => dt.items.add(ff));
    try { input.files = dt.files; } catch {}
    if (next.length === 0) { try { input.value = ''; } catch {} }
  }, []);

  const clientCreate = useCallback(async (fd: FormData) => {
    const all = fd.getAll('taskFiles');
    if (all.length) {
      const files = all.filter((x): x is File => x instanceof File);
      const real = files.filter((f) => f && f.size > 0 && (f.name || '').trim().length > 0);
      fd.delete('taskFiles');
      real.forEach((f) => fd.append('taskFiles', f, f.name));
    } else {
      fd.delete('taskFiles');
    }
    await createAction(fd);
  }, [createAction]);

  return (
    <div className="tf-card">
      <form action={clientCreate} className="tf-root">
        <div className="tf-head">
          <div className="tf-head-main">
            <h2 className="tf-title">Новая задача</h2>
            <p className="tf-subtitle">Заполните параметры задачи и выберите исполнителей</p>
          </div>
          <div className="tf-collapseToggleWrap">
            <button
              type="button"
              className="tf-collapseToggle"
              onClick={() => setCollapsedAll(v => !v)}
              aria-expanded={!collapsedAll}
              title={collapsedAll ? 'Развернуть' : 'Свернуть'}
            >
              <span className={`tf-arrow ${collapsedAll ? 'up' : 'down'}`} aria-hidden />
              <span className="tf-collapseText">{collapsedAll ? 'Развернуть' : 'Свернуть'}</span>
            </button>
          </div>
        </div>

        <section className={`tf-collapsibleAll ${collapsedAll ? 'is-collapsed' : 'is-open'}`} aria-hidden={collapsedAll}>
          <label className="tf-label">
            <span className="tf-label__text">Название</span>
            <input name="title" defaultValue="" required maxLength={256} className="tf-input" />
          </label>

          <label className="tf-label">
            <span className="tf-label__text">Описание</span>
            <textarea name="description" defaultValue="" rows={6} placeholder="Кратко опишите задачу..." className="tf-textarea" />
          </label>

          <div className="tf-3cols">
            <label className="tf-label">
              <span className="tf-label__text">Срок</span>
              <input type="date" name="date" value={due} min={todayStr} onChange={(e)=>setDue(e.target.value)} required className="tf-input" />
            </label>

            <label className="tf-label">
              <span className="tf-label__text">Время опц.</span>
              <input type="time" value={dueTime} onChange={(e)=>setDueTime(e.target.value)} className="tf-input" />
            </label>

            <div className="tf-label">
              <span className="tf-label__text">Приоритет</span>
              <div className="tf-switchRow" onClick={() => setPriority(p => p === 'high' ? 'normal' : 'high')}>
                <div
                  className={`tf-switch ${isHigh ? 'is-on' : ''}`}
                  role="switch"
                  aria-checked={isHigh}
                  title={isHigh ? 'срочно' : 'обычный'}
                >
                  <span className="tf-switch__thumb" aria-hidden />
                </div>
                <span className="tf-switchText">{isHigh ? 'срочно' : 'обычный'}</span>
              </div>
            </div>
          </div>

          <div className="tf-label">
            <span id="assign-label" className="tf-label__text">Кому назначить</span>
            <Chips
              users={users}
              roles={roles}
              groups={groups}
              subjects={subjects}
              assignees={assignees}
              setAssignees={setAssignees}
              query={query}
              setQuery={setQuery}
              found={found}
              setFound={setFound}
              openDd={openDd}
              setOpenDd={setOpenDd}
              onAdd={addAssignee}
              onRemove={removeAssignee}
              runSearch={runSearch}
              ariaLabelledby="assign-label"
            />
            <div className="tf-preview">
              Предпросмотр: {previewLoading ? 'подсчёт...' : `${previewTotal} исполнител${previewTotal % 10 === 1 && previewTotal % 100 !== 11 ? 'ь' : 'ей'}`}
            </div>
          </div>

          <div className="tf-bottomGrid">
            <div className="tf-files">
              <span className="tf-label__text">Вложения задачи (до 12 файлов)</span>

              <div className="tf-filechips">
                {taskFiles.map((f, idx) => {
                  const pct = Math.min((f?.size || 0) / MAX_BYTES, 1);
                  return (
                    <span key={idx} className="tf-chip">
                      <span className="tf-chip__label">{f.name}</span>
                      <span className="tf-chip__meter" style={{ width: `${pct*100}%` }} />
                      <button
                        type="button"
                        onClick={() => {
                          const next = taskFiles.slice();
                          next.splice(idx, 1);
                          syncTaskInputFiles(next);
                        }}
                        className="tf-chip__x"
                        aria-label="Удалить"
                        title="Убрать файл"
                      >×</button>
                    </span>
                  );
                })}
              </div>

              <input
                ref={taskFileInputRef}
                type="file"
                name={taskFiles.length ? 'taskFiles' : undefined}
                multiple
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  if (!list.length) return;
                  const next = [...taskFiles, ...list].slice(0, MAX_TASK_FILES);
                  syncTaskInputFiles(next);
                }}
                className="tf-file-hidden"
              />
              <div className="tf-filesRow">
                <button
                  type="button"
                  className="tf-btnBrand"
                  onClick={() => taskFileInputRef.current?.click()}
                >
                  Прикрепить файлы
                </button>

                <div className={`tf-gauge ${totalBytes > MAX_BYTES ? 'is-over' : totalPct >= 0.7 ? 'is-warn' : ''}`} role="progressbar"
                     aria-valuemin={0} aria-valuemax={50} aria-valuenow={Math.min(Number((totalBytes/(1024*1024)).toFixed(1)), 50)}>
                  <div className="tf-gauge__fill" style={{ width: `${totalPct*100}%` }} />
                </div>
                <div className={`tf-gaugeLabel ${totalBytes > MAX_BYTES ? 'is-over' : ''}`}>
                  {totalMbStr} из 50 МБ
                </div>
              </div>

              <div className="tf-help">Поддерживаются PDF, офисные документы и изображения до 50 МБ каждый.</div>
              {totalBytes > MAX_BYTES && <div className="tf-overflow">Превышен лимит 50 МБ. Уберите часть вложений.</div>}
            </div>

            {allowReviewControls && (
              <div className="tf-label tf-reviewBlock">
                <span className="tf-label__text">Требует проверки</span>
                <div className="tf-switchRow" onClick={() => setReviewRequired(v => !v)}>
                  <div
                    className={`tf-switch ${reviewRequired ? 'is-on' : ''}`}
                    role="switch"
                    aria-checked={reviewRequired}
                    title={reviewRequired ? 'нужна проверка' : 'без проверки'}
                  >
                    <span className="tf-switch__thumb" aria-hidden />
                  </div>
                  <span className="tf-switchText">{reviewRequired ? 'нужна проверка' : 'без проверки'}</span>
                </div>
              </div>
            )}

            <aside className="tf-side">
              <input type="hidden" name="due" value={dueIso} />
              <input type="hidden" name="priority" value={priority} />
              <input type="hidden" name="reviewRequired" value={reviewRequired ? '1' : ''} />
              <AssigneeIdsHidden computeIds={expandAssigneesToUserIds} />

              <div className="tf-actions">
                <SubmitButton label="Сохранить задачу" />
              </div>
            </aside>
          </div>
        </section>
      </form>
    </div>
  );
}

/* hidden ids — считаем на клиенте и кладём в input */
function AssigneeIdsHidden({ computeIds }: { computeIds: () => Promise<string[]> }) {
  const [val, setVal] = useState('[]');
  useEffect(() => { computeIds().then(ids => setVal(JSON.stringify(ids))).catch(() => setVal('[]')); });
  return <input type="hidden" name="assigneeUserIdsJson" value={val} />;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="tf-btnBrand" disabled={pending}>
      {pending ? 'Сохранение...' : label}
    </button>
  );
}

/* ===== Chips ===== */
function Chips(props: {
  users: SimpleUser[];
  roles: Array<{ id: string; name: string }>;
  groups: SimpleGroup[];
  subjects: SimpleSubject[];
  assignees: Candidate[];
  setAssignees: React.Dispatch<React.SetStateAction<Candidate[]>>;
  query: string; setQuery: React.Dispatch<React.SetStateAction<string>>;
  found: Candidate[]; setFound: React.Dispatch<React.SetStateAction<Candidate[]>>;
  openDd: boolean; setOpenDd: React.Dispatch<React.SetStateAction<boolean>>;
  onAdd: (a: Candidate) => void; onRemove: (a: Candidate) => void;
  runSearch: (q: string) => void;
  ariaLabelledby?: string;
}) {
  const { assignees, query, setQuery, found, openDd, setOpenDd, onAdd, onRemove, runSearch, ariaLabelledby } = props;
  const chipsRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ddRef = useRef<HTMLDivElement | null>(null);
  const [ddPos, setDdPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const updateDdPos = () => {
    const el = chipsRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setDdPos({ left: Math.round(r.left), top: Math.round(r.bottom + 6), width: Math.round(r.width) });
  };

  useLayoutEffect(() => {
    if (!openDd) return;
    updateDdPos();
    const onScroll = () => updateDdPos();
    const onResize = () => updateDdPos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [openDd, query, assignees]);

  useEffect(() => {
    if (!openDd) return;
    const onDown = (e: MouseEvent) => {
      const root = chipsRef.current;
      const dd = ddRef.current;
      const t = e.target as Node;
      if ((root && root.contains(t)) || (dd && dd.contains(t))) return;
      setOpenDd(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [openDd, setOpenDd]);

  return (
    <>
      <div
        ref={chipsRef}
        onClick={() => inputRef.current?.focus()}
        className="tf-chips"
      >
        {assignees.map((a) => (
          <span key={`${a.type}:${a.id}`} className="tf-chip">
            <span className="tf-chip__label">
              {a.name}{a.type==='group' ? ' (группа)' : a.type==='role' ? ' (роль)' : a.type==='subject' ? ' (предмет)' : ''}
            </span>
            <span className="tf-chip__meter" style={{ width: 0 }} aria-hidden />
            <button type="button" onClick={() => onRemove(a)} className="tf-chip__x" aria-label="Убрать" title="Убрать из списка">×</button>
          </span>
        ))}

        <input
          ref={inputRef}
          value={query}
          onChange={(e)=>{ setOpenDd(true); runSearch(e.target.value); }}
          onFocus={()=>{ setOpenDd(true); updateDdPos(); }}
          placeholder="Поиск: ФИО, группа, роль или предмет"
          className="tf-chips__input"
          aria-labelledby={ariaLabelledby}
        />
      </div>

      {openDd && found.length > 0 && ddPos &&
        createPortal(
          <div
            ref={ddRef}
            className="tf-dd"
            style={{ left:ddPos.left, top:ddPos.top, width:ddPos.width }}
          >
            {found.map((a) => (
              <div
                key={`${a.type}:${a.id}`}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onAdd(a); }}
                className="tf-dd__item"
              >
                {a.name}{a.type==='group' ? ' (группа)' : a.type==='role' ? ' (роль)' : a.type==='subject' ? ' (предмет)' : ''}
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

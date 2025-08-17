// app/inboxtasks/TaskForm.tsx
'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type SimpleUser  = { id: string; name: string | null; role?: string | null; methodicalGroups?: string | null; subjects?: any };
type SimpleGroup = { id: string; name: string };
type SimpleSubject = { name: string; count?: number };
type Candidate   = { type: 'user' | 'group' | 'role' | 'subject'; id: string; name: string };

type GroupMember = { groupId: string; userId: string };
type SubjectMember = { subjectName: string; userId: string };

const BRAND = '#8d2828';

// Получаем «сегодня» в зоне Asia/Yekaterinburg (UTC+5) в формате YYYY-MM-DD
const todayYekbYMD = () => {
  const fmt = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Yekaterinburg', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [{ value: day }, , { value: month }, , { value: year }] = fmt.formatToParts(new Date());
  return `${year}-${month}-${day}`;
};
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

export default function TaskForm({
  users,
  groups,
  subjects,
  groupMembers,
  subjectMembers,
  createAction,
}: {
  users: SimpleUser[];
  groups: SimpleGroup[];
  subjects: SimpleSubject[];
  groupMembers: GroupMember[];
  subjectMembers: SubjectMember[];
  createAction: (fd: FormData) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDesc] = useState('');
  const [due, setDue] = useState('');
  const [dueTime, setDueTime] = useState(''); // новое состояние времени (опционально)
  const [priority, setPriority] = useState<'normal'|'high'>('normal');
  const [noCalendar, setNoCalendar] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const todayStr = useMemo(() => todayYekbYMD(), []);

  useEffect(() => {
    const setR = new Set<string>();
    (users || []).forEach(u => {
      const canon = canonicalRole(u.role);
      if (canon) setR.add(canon);
    });
    setRoles(Array.from(setR).sort((a,b)=>a.localeCompare(b,'ru')).map(n => ({ id: n, name: n })));
  }, [users]);

  // кандидаты
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

  // развёртка выбранных в userId (через groupMembers / subjectMembers)
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
  }, [assignees, users]);

  useEffect(() => { void recomputePreview(); }, [assignees, recomputePreview]);

  const formRef = useRef<HTMLFormElement | null>(null);
  async function onSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();

    // Валидация: дата не раньше текущего дня в зоне Asia/Yekaterinburg
    const today = todayYekbYMD();
    if (!due || due < today) { alert('Срок не может быть раньше сегодняшнего дня (Екатеринбург).'); return; }

    const assigneeUserIds = await expandAssigneesToUserIds();

    // Формируем ISO в зоне Екатеринбурга (+05:00). Если время не указано — используем 23:59.
    const datePart = due;
    const timePart = (dueTime && /^\d{2}:\d{2}$/.test(dueTime)) ? dueTime : '23:59';
    const dueDate = new Date(`${datePart}T${timePart}:00+05:00`);
    const dueIso = dueDate.toISOString();

    const fd = new FormData();
    fd.set('title', title);
    fd.set('description', description);
    fd.set('due', dueIso);
    fd.set('priority', priority);
    fd.set('noCalendar', noCalendar ? '1' : '');
    fd.set('assigneeUserIdsJson', JSON.stringify(assigneeUserIds));

    await createAction(fd);

    try {
      setTitle(''); setDesc(''); setDue(''); setDueTime(''); setPriority('normal'); setNoCalendar(false);
      setAssignees([]); setQuery(''); setFound([]); setFiles([]); setPreviewTotal(0);
    } catch {}
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
      {/* Название */}
      <div>
        <label style={{ display: 'block', marginBottom: 4 }}>Название</label>
        <input value={title} onChange={(e)=>setTitle(e.target.value)} required
          style={{ width:'100%', padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:10, outline:'none' }}/>
      </div>

      {/* Описание */}
      <div>
        <label style={{ display: 'block', marginBottom: 4 }}>Описание</label>
        <textarea value={description} onChange={(e)=>setDesc(e.target.value)} rows={4}
          placeholder="Кратко опишите задачу…"
          style={{ width:'100%', padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:10, outline:'none', resize:'vertical' }}/>
      </div>

      {/* Срок, время (опц.) и приоритет */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
        <div>
          <label style={{ display:'block', marginBottom:4 }}>Срок</label>
          <input type="date" value={due} min={todayStr} onChange={(e)=>setDue(e.target.value)} required
            style={{ width:'100%', padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:10, outline:'none' }}/>
        </div>
        <div>
          <label style={{ display:'block', marginBottom:4 }}>Время (опц.)</label>
          <input type="time" value={dueTime} onChange={(e)=>setDueTime(e.target.value)}
            style={{ width:'100%', padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:10, outline:'none' }}/>
        </div>
        <div>
          <label style={{ display:'block', marginBottom:4 }}>Приоритет</label>
          <div style={{ display:'flex', gap:8 }}>
            <label style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
              <input type="radio" name="prio" checked={priority==='normal'} onChange={()=>setPriority('normal')} /> обычный
            </label>
            <label style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
              <input type="radio" name="prio" checked={priority==='high'} onChange={()=>setPriority('high')} /> срочно
            </label>
          </div>
        </div>
      </div>

      {/* Кому назначить */}
      <div>
        <label style={{ display:'block', marginBottom:4 }}>Кому назначить</label>
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
        />
        <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:13, color:'#374151' }}>
            Предпросмотр: {previewLoading ? 'подсчёт…' : `${previewTotal} исполнител${previewTotal % 10 === 1 && previewTotal % 100 !== 11 ? 'ь' : 'ей'}`}
          </span>
          <button type="button" onClick={()=>void recomputePreview()} style={{ height:28, padding:'0 10px', borderRadius:999, border:'1px solid #e5e7eb', background:'#fff', cursor:'pointer', fontSize:12 }}>
            Обновить
          </button>
        </div>
      </div>

      {/* Календарь */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:2 }}>
        <input id="noCal" type="checkbox" checked={noCalendar} onChange={(e)=>setNoCalendar(e.currentTarget.checked)} />
        <label htmlFor="noCal">не размещать в календаре</label>
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <button type="submit"
          style={{ height:36, padding:'0 14px', borderRadius:10, border:`1px solid ${BRAND}`, background:BRAND, color:'#fff', cursor:'pointer' }}>
          Сохранить задачу
        </button>
        <button type="button"
          onClick={()=>{ setTitle(''); setDesc(''); setDue(''); setDueTime(''); setPriority('normal'); setNoCalendar(false); setAssignees([]); setQuery(''); setFound([]); setFiles([]); setPreviewTotal(0); }}
          style={{ height:36, padding:'0 14px', borderRadius:10, border:'1px solid #e5e7eb', background:'#fff', cursor:'pointer' }}>
          Очистить
        </button>
      </div>
    </form>
  );
}

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
}) {
  const { assignees, query, setQuery, found, openDd, setOpenDd, onAdd, onRemove, runSearch } = props;
  const chipsRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ddRef = useRef<HTMLDivElement | null>(null); // НОВОЕ: ref на контейнер дропдауна
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
      if ((root && root.contains(t)) || (dd && dd.contains(t))) return; // клик внутри — не закрываем
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
        style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', padding:6, border:'1px solid #e5e7eb', borderRadius:10, minHeight:40, cursor:'text' }}
      >
        {assignees.map((a) => (
          <span key={`${a.type}:${a.id}`} style={{ display:'inline-flex', alignItems:'center', gap:6, border:'1px solid #e5e7eb', borderRadius:999, padding:'2px 8px', fontSize:12 }}>
            {a.name}{a.type==='group' ? ' (группа)' : a.type==='role' ? ' (роль)' : a.type==='subject' ? ' (предмет)' : ''}
            <button type="button" onClick={() => onRemove(a)} style={{ border:0, background:'transparent', cursor:'pointer', color:'#6b7280' }} aria-label="Убрать">×</button>
          </span>
        ))}

        <input
          ref={inputRef}
          value={query}
          onChange={(e)=>{ setOpenDd(true); runSearch(e.target.value); }}
          onFocus={()=>{ setOpenDd(true); updateDdPos(); }}
          placeholder="Поиск: ФИО, группа, роль или предмет"
          style={{ flex:'1 0 180px', minWidth:120, border:'none', outline:'none', padding:'6px 8px' }}
        />
      </div>
      {openDd && found.length > 0 && ddPos &&
        createPortal(
          <div
            ref={ddRef} // НОВОЕ: сохраняем ссылку на контейнер
            style={{ position:'fixed', left:ddPos.left, top:ddPos.top, width:ddPos.width, zIndex:1000, background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, boxShadow:'0 4px 8px rgba(0,0,0,0.08)', maxHeight:300, overflowY:'auto' }}
          >
            {found.map((a) => (
              <div
                key={`${a.type}:${a.id}`}
                // НОВОЕ: используем onMouseDown, чтобы обработать раньше глобального mousedown
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onAdd(a); }}
                style={{ padding:'6px 10px', cursor:'pointer', fontSize:13 }}
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

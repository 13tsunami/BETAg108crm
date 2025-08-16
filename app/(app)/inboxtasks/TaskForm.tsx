// app/inboxTasks/TaskForm.tsx
'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type SimpleUser  = { id: string; name: string | null; role?: string | null; methodicalGroups?: string | null; subjects?: any };
type SimpleGroup = { id: string; name: string };
type SimpleSubject = { name: string; count?: number };
type Candidate   = { type: 'user' | 'group' | 'role' | 'subject'; id: string; name: string };

const BRAND = '#8d2828';

const todayLocalYMD = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
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
  createAction,
}: {
  users: SimpleUser[];
  groups?: SimpleGroup[];
  createAction: (fd: FormData) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDesc] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<'normal'|'high'>('normal');
  const [noCalendar, setNoCalendar] = useState(false);

  const [files, setFiles] = useState<File[]>([]); // заглушка
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // роли/группы/предметы для пикера
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [groupsLocal, setGroupsLocal] = useState<SimpleGroup[]>(groups ?? []);
  const [dbGroupIds, setDbGroupIds] = useState<Set<string>>(new Set());
  const [subjectsLocal, setSubjectsLocal] = useState<SimpleSubject[]>([]);

  const todayStr = useMemo(() => todayLocalYMD(), []);

  useEffect(() => {
    const setR = new Set<string>();
    (users || []).forEach(u => {
      const canon = canonicalRole(u.role);
      if (canon) setR.add(canon);
    });
    setRoles(Array.from(setR).sort((a,b)=>a.localeCompare(b,'ru')).map(n => ({ id: n, name: n })));
  }, [users]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/groups?limit=5000', { cache: 'no-store' });
        if (r.ok) {
          const arr = await r.json() as SimpleGroup[];
          if (alive && Array.isArray(arr)) {
            setGroupsLocal(arr);
            setDbGroupIds(new Set(arr.map(g => g.id)));
            return;
          }
        }
      } catch {}
      const setG = new Set<string>();
      (users || []).forEach(u => splitGroups(u.methodicalGroups).forEach(g => setG.add(g)));
      const list = Array.from(setG).sort((a,b)=>a.localeCompare(b,'ru')).map(name => ({ id: name, name }));
      if (alive) { setGroupsLocal(list); setDbGroupIds(new Set()); }
    })();
    return () => { alive = false; };
  }, [groups, users]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/subjects', { cache: 'no-store' });
        if (r.ok) {
          const arr = await r.json() as Array<{ name: string; count?: number }>;
          if (alive && Array.isArray(arr)) { setSubjectsLocal(arr); return; }
        }
      } catch {}
      const setS = new Set<string>();
      (users || []).forEach(u => parseSubjects(u.subjects).forEach(s => setS.add(s)));
      const list = Array.from(setS).sort((a,b)=>a.localeCompare(b,'ru')).map(name => ({ name }));
      if (alive) setSubjectsLocal(list);
    })();
    return () => { alive = false; };
  }, [users]);

  // кандидаты
  type Candidate = { type: 'user'|'group'|'role'|'subject'; id: string; name: string };
  const allCandidates = useMemo<Candidate[]>(() => {
    const us: Candidate[] = (users || []).map((u) => ({ type: 'user', id: u.id, name: u.name || u.id }));
    const gs: Candidate[] = (groupsLocal || []).map((g) => ({ type: 'group', id: g.id, name: g.name || g.id }));
    const rs: Candidate[] = (roles || []).map((r) => ({ type: 'role', id: r.id, name: r.name }));
    const ss: Candidate[] = (subjectsLocal || []).map((s) => ({ type: 'subject', id: s.name, name: s.name }));
    return [...us, ...gs, ...rs, ...ss];
  }, [users, groupsLocal, roles, subjectsLocal]);

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

  // кэши
  const groupMembersCache = useRef<Map<string, string[]>>(new Map());
  const subjectMembersCache = useRef<Map<string, string[]>>(new Map());

  // развёртка выбранных в userId
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

    const chosenGroups = assignees.filter(a => a.type === 'group');
    const apiGroups = chosenGroups.filter(g => dbGroupIds.has(g.id));
    const localGroups = chosenGroups.filter(g => !dbGroupIds.has(g.id)).map(g => norm(g.id));

    for (const g of apiGroups) {
      const cached = groupMembersCache.current.get(g.id);
      if (cached) { cached.forEach(id => userIds.add(id)); continue; }
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await fetch(`/api/groups/${g.id}/members`, { cache: 'no-store' });
        if (r.ok) {
          // eslint-disable-next-line no-await-in-loop
          const arr = await r.json() as string[];
          if (Array.isArray(arr)) {
            groupMembersCache.current.set(g.id, arr);
            arr.forEach(id => userIds.add(String(id)));
          }
        }
      } catch {}
    }
    if (localGroups.length) {
      (users || []).forEach(u => {
        const mg = splitGroups(u.methodicalGroups).map(norm);
        if (mg.some(g => localGroups.includes(g))) userIds.add(u.id);
      });
    }

    const chosenSubjects = assignees.filter(a => a.type === 'subject').map(a => a.id);
    for (const s of chosenSubjects) {
      const cached = subjectMembersCache.current.get(s);
      if (cached) { cached.forEach(id => userIds.add(id)); continue; }
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await fetch(`/api/subjects/${encodeURIComponent(s)}/members`, { cache: 'no-store' });
        if (r.ok) {
          // eslint-disable-next-line no-await-in-loop
          const arr = await r.json() as string[];
          if (Array.isArray(arr)) {
            subjectMembersCache.current.set(s, arr);
            arr.forEach(id => userIds.add(String(id)));
            continue;
          }
        }
        (users || []).forEach(u => { if (parseSubjects(u.subjects).includes(s)) userIds.add(u.id); });
      } catch {
        (users || []).forEach(u => { if (parseSubjects(u.subjects).includes(s)) userIds.add(u.id); });
      }
    }

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

  // сабмит через server action: собираем FormData и отдаём в createAction
  const formRef = useRef<HTMLFormElement | null>(null);
  async function onSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const today = todayLocalYMD();
    if (!due || due < today) { alert('Срок не может быть раньше сегодняшнего дня.'); return; }

    const assigneeUserIds = await expandAssigneesToUserIds();
    const fd = new FormData();
    fd.set('title', title);
    fd.set('description', description);
    fd.set('due', due);
    fd.set('priority', priority);
    fd.set('noCalendar', noCalendar ? '1' : '');
    fd.set('assigneeUserIdsJson', JSON.stringify(assigneeUserIds));

    await createAction(fd);
    // если сервер не сделал redirect (вдруг добавите), локально чистим
    try {
      setTitle(''); setDesc(''); setDue(''); setPriority('normal'); setNoCalendar(false);
      setAssignees([]); setQuery(''); setFound([]); setFiles([]); setPreviewTotal(0);
    } catch {}
  }

  return (
    <>
      <form ref={formRef} onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>Название</label>
          <input value={title} onChange={(e)=>setTitle(e.target.value)} required
            style={{ width:'100%', padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:10, outline:'none' }}/>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>Описание</label>
          <textarea value={description} onChange={(e)=>setDesc(e.target.value)} rows={4}
            placeholder="Кратко опишите задачу…"
            style={{ width:'100%', padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:10, outline:'none', resize:'vertical' }}/>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div>
            <label style={{ display:'block', marginBottom:4 }}>Срок</label>
            <input type="date" value={due} min={todayStr} onChange={(e)=>setDue(e.target.value)} required
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

        {/* Файлы — заглушка */}
        <div>
          <label style={{ display:'block', marginBottom:4 }}>Файлы (пока заглушка)</label>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <input ref={fileInputRef} type="file" multiple onChange={(e)=>setFiles(Array.from(e.target.files ?? []))} style={{ display:'none' }}/>
            <button type="button" onClick={()=>fileInputRef.current?.click()}
              style={{ height:36, padding:'0 14px', borderRadius:10, border:`1px solid ${BRAND}`, background:BRAND, color:'#fff', cursor:'pointer' }}>
              Выбрать файлы
            </button>
            {!!files.length && (
              <div style={{ marginTop:2, border:'1px solid #f3f4f6', borderRadius:8, padding:8, background:'#fff' }}>
                <div style={{ fontSize:12, color:'#6b7280', marginBottom:4 }}>Будут прикреплены позже:</div>
                <ul style={{ margin:0, paddingLeft:18 }}>
                  {files.map((f)=>(<li key={f.name} style={{ fontSize:12 }}>{f.name} <span style={{ color:'#6b7280' }}>({Math.round(f.size/1024)} КБ)</span></li>))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div>
          <label style={{ display:'block', marginBottom:4 }}>Кому назначить</label>
          <Chips
            users={users}
            roles={roles}
            groups={groupsLocal}
            subjects={subjectsLocal}
            dbGroupIds={dbGroupIds}
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

        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:2 }}>
          <input id="noCal" type="checkbox" checked={noCalendar} onChange={(e)=>setNoCalendar(e.currentTarget.checked)} />
          <label htmlFor="noCal">не размещать в календаре</label>
        </div>

        <div style={{ height:4 }} />

        <div style={{ display:'flex', gap:8 }}>
          <button type="submit"
            style={{ height:36, padding:'0 14px', borderRadius:10, border:`1px solid ${BRAND}`, background:BRAND, color:'#fff', cursor:'pointer' }}>
            Сохранить задачу
          </button>
          <button type="button"
            onClick={()=>{ setTitle(''); setDesc(''); setDue(''); setPriority('normal'); setNoCalendar(false); setAssignees([]); setQuery(''); setFound([]); setFiles([]); setPreviewTotal(0); }}
            style={{ height:36, padding:'0 14px', borderRadius:10, border:'1px solid #e5e7eb', background:'#fff', cursor:'pointer' }}>
            Очистить
          </button>
        </div>
      </form>
    </>
  );
}

function Chips(props: {
  users: SimpleUser[];
  roles: Array<{ id: string; name: string }>;
  groups: SimpleGroup[];
  subjects: SimpleSubject[];
  dbGroupIds: Set<string>;
  assignees: Candidate[];
  setAssignees: React.Dispatch<React.SetStateAction<Candidate[]>>;
  query: string; setQuery: React.Dispatch<React.SetStateAction<string>>;
  found: Candidate[]; setFound: React.Dispatch<React.SetStateAction<Candidate[]>>;
  openDd: boolean; setOpenDd: React.Dispatch<React.SetStateAction<boolean>>;
  onAdd: (a: Candidate) => void; onRemove: (a: Candidate) => void;
  runSearch: (q: string) => void;
}) {
  const { assignees, setAssignees, query, setQuery, found, setFound, openDd, setOpenDd, onAdd, onRemove, runSearch } = props;
  const chipsRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
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
      const el = chipsRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setOpenDd(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [openDd]);

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

      {openDd && query.trim() && ddPos && typeof document !== 'undefined' && createPortal(
        <div
          className="card"
          style={{ position:'fixed', left:ddPos.left, top:ddPos.top, width:ddPos.width, zIndex:10000, padding:4, maxHeight:260, overflowY:'auto', background:'#fff', border:'1px solid #e5e7eb', borderRadius:12 }}
          onMouseDown={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
        >
          {found.length === 0 && (<div style={{ padding:8, color:'#6b7280' }}>Никого не нашли.</div>)}
          {found.map((x) => (
            <button
              key={`${x.type}:${x.id}`}
              type="button"
              onMouseDown={(e)=>{ e.preventDefault(); e.stopPropagation(); onAdd(x); }}
              style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 10px', borderRadius:8, cursor:'pointer', background:'transparent', border:'none' }}
              title={x.name}
            >
              {x.name}{x.type==='group' ? ' — группа' : x.type==='role' ? ' — роль' : x.type==='subject' ? ' — предмет' : ''}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

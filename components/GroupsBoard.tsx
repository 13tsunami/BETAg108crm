'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  createGroup, renameGroup, deleteGroup,
  addUsersToGroup, removeUserFromGroup, fetchGroupMembers,
  createSubject, renameSubject, deleteSubject,
  addUsersToSubject, removeUserFromSubject, fetchSubjectMembers,
} from '@/app/(app)/groups/actions';

type SimpleUser = { id: string; name: string | null; role?: string | null };
type Group = { id: string; name: string };
type Subject = { id: string; name: string; count: number };

export default function GroupsBoard(props: {
  initialUsers: SimpleUser[];
  initialGroups: Group[];
  initialSubjects: Subject[];
  subjectsEnabled?: boolean;
}) {
  const router = useRouter();
  const subjectsEnabled = props.subjectsEnabled ?? true;

  const [tab, setTab] = React.useState<'groups' | 'subjects'>('groups');

  // пользователи
  const [users] = React.useState<SimpleUser[]>(props.initialUsers);
  const [qUser, setQUser] = React.useState<string>('');

  // группы
  const [groups, setGroups] = React.useState<Group[]>(props.initialGroups);
  const [selGroupId, setSelGroupId] = React.useState<string | null>(null);
  const [groupMembers, setGroupMembers] = React.useState<{ userId: string; name: string | null }[]>([]);
  const [qGroup, setQGroup] = React.useState<string>('');
  const [groupNameInput, setGroupNameInput] = React.useState<string>('');
  const [mCreateGroup, setMCreateGroup] = React.useState<boolean>(false);
  const [mRenameGroup, setMRenameGroup] = React.useState<boolean>(false);
  const [mDeleteGroup, setMDeleteGroup] = React.useState<boolean>(false);

  // предметы
  const [subjects, setSubjects] = React.useState<Subject[]>(props.initialSubjects);
  const [selSubjectId, setSelSubjectId] = React.useState<string | null>(null);
  const [subjectMembers, setSubjectMembers] = React.useState<{ userId: string; name: string | null }[]>([]);
  const [qSubject, setQSubject] = React.useState<string>('');
  const [subjectNameInput, setSubjectNameInput] = React.useState<string>('');
  const [mCreateSubject, setMCreateSubject] = React.useState<boolean>(false);
  const [mRenameSubject, setMRenameSubject] = React.useState<boolean>(false);
  const [mDeleteSubject, setMDeleteSubject] = React.useState<boolean>(false);

  // выбор пользователей
  const [selUserIds, setSelUserIds] = React.useState<string[]>([]);
  function toggleUser(id: string) {
    setSelUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // НОВОЕ: универсальный автокомплит в стиле проекта
  function AutoComplete(props: {
    value: string;
    onChange: (s: string) => void;
    items: { id: string; label: string; hint?: string }[];
    placeholder: string;
    onSelect: (id: string) => void;
  }) {
    const [open, setOpen] = React.useState(false);
    const [hover, setHover] = React.useState(-1);
    const boxRef = React.useRef<HTMLDivElement | null>(null);

    const norm = (s: string) => s.trim().toLowerCase();
    const q = norm(props.value);
    const filtered = React.useMemo(() => {
      if (!q) return props.items.slice(0, 20);
      const starts: typeof props.items = [];
      const contains: typeof props.items = [];
      for (const it of props.items) {
        const hay = (it.label + ' ' + (it.hint ?? '')).toLowerCase();
        if (hay.startsWith(q)) starts.push(it);
        else if (hay.includes(q)) contains.push(it);
        if (starts.length + contains.length >= 50) break;
      }
      return [...starts, ...contains];
    }, [q, props.items]);

    React.useEffect(() => {
      function onDoc(e: MouseEvent) {
        if (!boxRef.current) return;
        if (!boxRef.current.contains(e.target as Node)) setOpen(false);
      }
      document.addEventListener('mousedown', onDoc);
      return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
      if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
        setOpen(true);
        return;
      }
      if (!open) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setHover((h) => Math.min(h + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHover((h) => Math.max(h - 1, 0)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const it = filtered[hover] ?? filtered[0];
        if (it) { props.onSelect(it.id); setOpen(false); }
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }

    return (
      <div ref={boxRef} style={{ position: 'relative', marginTop: 8 }}>
        <input
          value={props.value}
          onChange={(e) => { props.onChange(e.target.value); setOpen(true); setHover(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder={props.placeholder}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff' }}
        />
        {open && filtered.length > 0 && (
          <div
            style={{
              position: 'absolute',
              zIndex: 1000,
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 6,
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
              maxHeight: 300,
              overflow: 'auto'
            }}
          >
            {filtered.map((it, i) => (
              <button
                key={it.id}
                type="button"
                onMouseEnter={() => setHover(i)}
                onClick={() => { props.onSelect(it.id); setOpen(false); }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  background: i === hover ? '#fff5f5' : '#fff',
                  border: 'none',
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer'
                }}
                title={it.hint}
              >
                <div style={{ fontSize: 13, color: '#111827' }}>{it.label}</div>
                {it.hint ? <div style={{ fontSize: 11, color: '#6b7280' }}>{it.hint}</div> : null}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function resetSelection() { setSelUserIds([]); }

  // фильтры
  const filteredUsers = React.useMemo<SimpleUser[]>(() => {
    const s = qUser.trim().toLowerCase();
    return s ? users.filter((u) => (u.name || '').toLowerCase().includes(s)) : users;
  }, [users, qUser]);

  const filteredGroups = React.useMemo<Group[]>(() => {
    const s = qGroup.trim().toLowerCase();
    return s ? groups.filter((g) => g.name.toLowerCase().includes(s)) : groups;
  }, [groups, qGroup]);

  const filteredSubjects = React.useMemo<Subject[]>(() => {
    const s = qSubject.trim().toLowerCase();
    return s ? subjects.filter((x) => x.name.toLowerCase().includes(s)) : subjects;
  }, [subjects, qSubject]);

  // загрузка составов
  React.useEffect(() => {
    let live = true;
    (async () => {
      if (!selGroupId) { setGroupMembers([]); return; }
      const rows = await fetchGroupMembers(selGroupId);
      if (live) setGroupMembers(rows);
    })();
    return () => { live = false; };
  }, [selGroupId]);

  React.useEffect(() => {
    let live = true;
    (async () => {
      if (!selSubjectId) { setSubjectMembers([]); return; }
      const rows = await fetchSubjectMembers(selSubjectId);
      if (live) setSubjectMembers(rows);
    })();
    return () => { live = false; };
  }, [selSubjectId]);

  // UI helpers
  const BRAND = '#8d2828';
  function Primary(props: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean; danger?: boolean }>) {
    return (
      <button
        type="button"
        onClick={props.onClick}
        disabled={props.disabled}
        style={{
          height: 32, padding: '0 12px', borderRadius: 10,
          border: `1px solid ${props.danger ? BRAND : BRAND}`,
          background: props.disabled ? '#f3f4f6' : (props.danger ? BRAND : BRAND),
          color: props.disabled ? '#9ca3af' : '#fff',
          cursor: props.disabled ? 'not-allowed' : 'pointer', fontWeight: 700,
        }}
      >
        {props.children}
      </button>
    );
  }
  function Secondary(props: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) {
    return (
      <button
        type="button"
        onClick={props.onClick}
        disabled={props.disabled}
        style={{ height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: props.disabled ? 'not-allowed' : 'pointer' }}
      >
        {props.children}
      </button>
    );
  }
  function Card(props: React.PropsWithChildren<{ style?: React.CSSProperties }>) {
    return <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, ...props.style }}>{props.children}</div>;
  }
  function Search({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder: string }) {
    return (
      <div style={{ marginTop: 8 }}>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 10 }} />
      </div>
    );
  }
  function ListBox({ children, innerHeight = 460 }: { children: React.ReactNode; innerHeight?: number }) {
    return <div style={{ marginTop: 8, height: innerHeight, overflow: 'auto', border: '1px solid #f3f4f6', borderRadius: 10 }}>{children}</div>;
  }
  function RowButton({ active, onClick, title, children }: { active?: boolean; onClick?: () => void; title?: string; children: React.ReactNode }) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: active ? '#fff5f5' : 'transparent', border: 'none', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
      >
        {children}
      </button>
    );
  }
  function Modal(props: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    actions?: React.ReactNode;
  }) {
    if (!props.open) return null;

    return (
      <div
        onClick={props.onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 420,
            maxWidth: '94vw',
            padding: 16,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
          }}
        >
          <h2 style={{ marginTop: 0 }}>{props.title}</h2>
          {props.children}
          {props.actions ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 12,
              }}
            >
              {props.actions}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // ГРУППЫ
  async function onCreateGroup() {
    const name = groupNameInput.trim(); if (!name) return;
    await createGroup(name);
    setMCreateGroup(false);
    setGroupNameInput('');
    router.refresh();
  }
  async function onRenameGroup() {
    if (!selGroupId) return;
    const name = groupNameInput.trim(); if (!name) return;
    await renameGroup(selGroupId, name);
    setMRenameGroup(false);
    setGroups((gs) => gs.map((g) => (g.id === selGroupId ? { ...g, name } : g)));
    router.refresh();
  }
  async function onDeleteGroup() {
    if (!selGroupId) return;
    await deleteGroup(selGroupId);
    setMDeleteGroup(false);
    setSelGroupId(null);
    setGroupMembers([]);
    setGroups((gs) => gs.filter((g) => g.id !== selGroupId));
    router.refresh();
  }
  async function onAddSelectedToGroup() {
    if (!selGroupId || selUserIds.length === 0) return;
    await addUsersToGroup(selGroupId, selUserIds);
    setSelUserIds([]);
    const rows = await fetchGroupMembers(selGroupId);
    setGroupMembers(rows);
    router.refresh();
  }
  async function onRemoveMember(userId: string) {
    if (!selGroupId) return;
    await removeUserFromGroup(selGroupId, userId);
    const rows = await fetchGroupMembers(selGroupId);
    setGroupMembers(rows);
    router.refresh();
  }

  // ПРЕДМЕТЫ
  async function onCreateSubject() {
    const name = subjectNameInput.trim(); if (!name) return;
    await createSubject(name);
    setMCreateSubject(false);
    setSubjectNameInput('');
    // оптимистично: запросим свежий список
    router.refresh();
  }
  async function onRenameSubject() {
    if (!selSubjectId) return;
    const name = subjectNameInput.trim(); if (!name) return;
    await renameSubject(selSubjectId, name);
    setMRenameSubject(false);
    setSubjects((ss) => ss.map((s) => (s.id === selSubjectId ? { ...s, name } : s)));
    router.refresh();
  }
  async function onDeleteSubject() {
    if (!selSubjectId) return;
    await deleteSubject(selSubjectId);
    setMDeleteSubject(false);
    setSelSubjectId(null);
    setSubjectMembers([]);
    setSubjects((ss) => ss.filter((s) => s.id !== selSubjectId));
    router.refresh();
  }
  async function onAddSelectedToSubject() {
    if (!selSubjectId || selUserIds.length === 0) return;
    await addUsersToSubject(selSubjectId, selUserIds);
    setSelUserIds([]);
    const rows = await fetchSubjectMembers(selSubjectId);
    setSubjectMembers(rows);
    router.refresh();
  }
  async function onRemoveSubjectMember(userId: string) {
    if (!selSubjectId) return;
    await removeUserFromSubject(selSubjectId, userId);
    const rows = await fetchSubjectMembers(selSubjectId);
    setSubjectMembers(rows);
    router.refresh();
  }

  return (
    <section style={{ fontFamily: '"Times New Roman", serif', fontSize: 12 }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 8, marginBottom: 12, display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setTab('groups')}
                style={{ padding: '6px 10px', borderRadius: 10, border: tab === 'groups' ? '1px solid #e5e7eb' : '1px solid transparent', background: tab === 'groups' ? '#f9fafb' : 'transparent', fontWeight: 800 }}>
          Группы
        </button>
        <button type="button" onClick={() => setTab('subjects')} disabled={!subjectsEnabled}
                style={{ padding: '6px 10px', borderRadius: 10, border: tab === 'subjects' ? '1px solid #e5e7eb' : '1px solid transparent', background: subjectsEnabled ? (tab === 'subjects' ? '#f9fafb' : 'transparent') : '#fafafa', color: subjectsEnabled ? undefined : '#9ca3af', fontWeight: 800 }}>
          Предметы
        </button>
      </div>

      {tab === 'groups' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>Пользователи</div>
              <div style={{ color: '#6b7280' }}>{filteredUsers.length}</div>
            </div>
            <Search value={qUser} onChange={setQUser} placeholder="Поиск ФИО" />
            <ListBox>
              {filteredUsers.map((u) => {
                const active = selUserIds.includes(u.id);
                return (
                  <RowButton key={u.id} active={active} onClick={() => toggleUser(u.id)} title={u.role || undefined}>
                    <strong style={{ color: '#111827' }}>{u.name || u.id}</strong>
                    {active ? <span style={{ marginLeft: 8, fontSize: 11, color: '#8d2828' }}>выбран</span> : null}
                  </RowButton>
                );
              })}
            </ListBox>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <Primary onClick={onAddSelectedToGroup} disabled={!selGroupId || selUserIds.length === 0}>Добавить в группу</Primary>
              <Secondary onClick={resetSelection}>Сбросить выбор</Secondary>
            </div>
          </Card>

          <Card style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>Группы</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Secondary onClick={() => { setGroupNameInput(''); setMCreateGroup(true); }}>Создать группу</Secondary>
              </div>
            </div>

            {/* ЗАМЕНЕНО: поиск по группам -> автокомплит */}
            <AutoComplete
              value={qGroup}
              onChange={setQGroup}
              placeholder="Поиск группы"
              items={groups.map(g => ({ id: g.id, label: g.name }))}
              onSelect={(id) => {
                setSelGroupId(id);
                const g = groups.find(x => x.id === id);
                if (g) setQGroup(g.name);
              }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
              <ListBox>
                {filteredGroups.map((g) => {
                  const active = selGroupId === g.id;
                  return (
                    <RowButton key={g.id} active={active} onClick={() => setSelGroupId(g.id)} title={g.id}>
                      <strong>{g.name}</strong>{active ? <span style={{ marginLeft: 8, fontSize: 11, color: '#8d2828' }}>выбрана</span> : null}
                    </RowButton>
                  );
                })}
              </ListBox>

              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontWeight: 800 }}>Состав группы</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Secondary onClick={() => { if (!selGroupId) return; const n = groups.find((g) => g.id === selGroupId)?.name ?? ''; setGroupNameInput(n); setMRenameGroup(true); }} disabled={!selGroupId}>Переименовать</Secondary>
                    <Primary danger onClick={() => setMDeleteGroup(true)} disabled={!selGroupId}>Удалить</Primary>
                  </div>
                </div>

                {!selGroupId ? (
                  <div style={{ padding: 8, color: '#6b7280' }}>Выберите группу слева.</div>
                ) : (
                  <ListBox innerHeight={380}>
                    {groupMembers.length === 0 ? <div style={{ padding: 8, color: '#6b7280' }}>В группе пока нет участников.</div> : null}
                    {groupMembers.map((m) => (
                      <div key={m.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>
                        <div>{m.name || m.userId}</div>
                        <Secondary onClick={() => onRemoveMember(m.userId)}>Убрать</Secondary>
                      </div>
                    ))}
                  </ListBox>
                )}
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>Пользователи</div>
              <div style={{ color: '#6b7280' }}>{filteredUsers.length}</div>
            </div>
            <Search value={qUser} onChange={setQUser} placeholder="Поиск ФИО" />
            <ListBox>
              {filteredUsers.map((u) => {
                const active = selUserIds.includes(u.id);
                return (
                  <RowButton key={u.id} active={active} onClick={() => toggleUser(u.id)} title={u.role || undefined}>
                    <strong style={{ color: '#111827' }}>{u.name || u.id}</strong>
                    {active ? <span style={{ marginLeft: 8, fontSize: 11, color: '#8d2828' }}>выбран</span> : null}
                  </RowButton>
                );
              })}
            </ListBox>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <Primary onClick={onAddSelectedToSubject} disabled={!selSubjectId || selUserIds.length === 0}>Назначить предмет</Primary>
              <Secondary onClick={resetSelection}>Сбросить выбор</Secondary>
            </div>
          </Card>

          <Card style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>Предметы</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Secondary onClick={() => { setSubjectNameInput(''); setMCreateSubject(true); }}>Создать предмет</Secondary>
              </div>
            </div>

            {/* ЗАМЕНЕНО: поиск по предметам -> автокомплит */}
            <AutoComplete
              value={qSubject}
              onChange={setQSubject}
              placeholder="Поиск предмета"
              items={subjects.map(s => ({ id: s.id, label: s.name, hint: s.count ? `${s.count}` : undefined }))}
              onSelect={(id) => {
                setSelSubjectId(id);
                const s = subjects.find(x => x.id === id);
                if (s) setQSubject(s.name);
              }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
              <ListBox>
                {filteredSubjects.map((s) => {
                  const active = selSubjectId === s.id;
                  return (
                    <RowButton key={s.id} active={active} onClick={() => setSelSubjectId(s.id)} title={`${s.count} чел.`}>
                      <strong>{s.name}</strong><span style={{ marginLeft: 8, fontSize: 11, color: '#6b7280' }}>{s.count}</span>
                      {active ? <span style={{ marginLeft: 8, fontSize: 11, color: '#8d2828' }}>выбран</span> : null}
                    </RowButton>
                  );
                })}
              </ListBox>

              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontWeight: 800 }}>Состав предмета</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Secondary onClick={() => { if (!selSubjectId) return; const n = subjects.find((s) => s.id === selSubjectId)?.name ?? ''; setSubjectNameInput(n); setMRenameSubject(true); }} disabled={!selSubjectId}>Переименовать</Secondary>
                    <Primary danger onClick={() => setMDeleteSubject(true)} disabled={!selSubjectId}>Удалить</Primary>
                  </div>
                </div>

                {!selSubjectId ? (
                  <div style={{ padding: 8, color: '#6b7280' }}>Выберите предмет слева.</div>
                ) : (
                  <ListBox innerHeight={380}>
                    {subjectMembers.length === 0 ? <div style={{ padding: 8, color: '#6b7280' }}>К предмету пока не привязаны преподаватели.</div> : null}
                    {subjectMembers.map((m) => (
                      <div key={m.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>
                        <div>{m.name || m.userId}</div>
                        <Secondary onClick={() => onRemoveSubjectMember(m.userId)}>Убрать</Secondary>
                      </div>
                    ))}
                  </ListBox>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Модалки групп */}
      <Modal open={mCreateGroup} title="Создать группу" onClose={() => setMCreateGroup(false)}
             actions={<><Secondary onClick={() => setMCreateGroup(false)}>Отмена</Secondary><Primary onClick={onCreateGroup}>Создать</Primary></>}>
        <input value={groupNameInput} onChange={(e) => setGroupNameInput(e.target.value)} placeholder="Название группы"
               style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 10 }} />
      </Modal>

      <Modal open={mRenameGroup} title="Переименовать группу" onClose={() => setMRenameGroup(false)}
             actions={<><Secondary onClick={() => setMRenameGroup(false)}>Отмена</Secondary><Primary onClick={onRenameGroup}>Сохранить</Primary></>}>
        <input value={groupNameInput} onChange={(e) => setGroupNameInput(e.target.value)} placeholder="Новое название"
               style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 10 }} />
      </Modal>

      <Modal open={mDeleteGroup} title="Удалить группу" onClose={() => setMDeleteGroup(false)}
             actions={<><Secondary onClick={() => setMDeleteGroup(false)}>Отмена</Secondary><Primary danger onClick={onDeleteGroup}>Удалить</Primary></>}>
        <div style={{ color: '#6b7280' }}>Группа будет удалена. Участники остаются в БД.</div>
      </Modal>

      {/* Модалки предметов */}
      <Modal open={mCreateSubject} title="Создать предмет" onClose={() => setMCreateSubject(false)}
             actions={<><Secondary onClick={() => setMCreateSubject(false)}>Отмена</Secondary><Primary onClick={onCreateSubject}>Создать</Primary></>}>
        <input value={subjectNameInput} onChange={(e) => setSubjectNameInput(e.target.value)} placeholder="Название предмета"
               style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 10 }} />
      </Modal>

      <Modal open={mRenameSubject} title="Переименовать предмет" onClose={() => setMRenameSubject(false)}
             actions={<><Secondary onClick={() => setMRenameSubject(false)}>Отмена</Secondary><Primary onClick={onRenameSubject}>Сохранить</Primary></>}>
        <input value={subjectNameInput} onChange={(e) => setSubjectNameInput(e.target.value)} placeholder="Новое название"
               style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 10 }} />
      </Modal>

      <Modal open={mDeleteSubject} title="Удалить предмет" onClose={() => setMDeleteSubject(false)}
             actions={<><Secondary onClick={() => setMDeleteSubject(false)}>Отмена</Secondary><Primary danger onClick={onDeleteSubject}>Удалить</Primary></>}>
        <div style={{ color: '#6b7280' }}>Предмет и привязки будут удалены.</div>
      </Modal>
    </section>
  );
}

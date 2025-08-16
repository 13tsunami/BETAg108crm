// app/(app)/inboxtasks/page.tsx
import { auth } from '@/auth.config';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import TaskForm from './TaskForm';
import { createTaskAction, updateTaskAction, deleteTaskAction, markDoneAction } from './actions';

type Task = {
  id: string;
  seq?: number | null;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: 'high' | 'normal' | string | null;
  hidden?: boolean | null;
  createdById?: string | null;
  assignees?: Array<{ userId: string; status?: string; doneAt?: string | null }>;
  assignedTo?: Array<{ type?: 'user'; id: string }>;
};

type SimpleUser = { id: string; name: string | null; role?: string | null; methodicalGroups?: string | null; subjects?: any };
type SimpleGroup = { id: string; name: string };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Надёжно получаем origin для server fetch (работает на Vercel/прокси) */
async function getOrigin() {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  return `${proto}://${host}`;
}

async function requireMe() {
  const session = await auth();
  const meId = (session?.user as any)?.id as string | undefined;
  if (!meId) redirect('/sign-in');
  const meName = (session?.user as any)?.name as string | undefined;
  return { meId, meName: meName ?? 'Вы' };
}

async function fetchJson<T>(base: string, path: string, fallback: T): Promise<T> {
  const url = path.startsWith('http') ? path : `${base}${path}`;
  try {
    const r = await fetch(url, { cache: 'no-store', next: { revalidate: 0 } });
    if (!r.ok) return fallback;
    const j = await r.json();
    return (j ?? fallback) as T;
  } catch {
    return fallback;
  }
}

async function getUsers(base: string): Promise<SimpleUser[]> {
  // как и было: сначала чат-пользователи, потом обогащаем из /api/users
  const chatUsers = await fetchJson<any[]>(base, '/api/chat/users?includeSelf=1&limit=2000', []);
  const byId = new Map<string, SimpleUser>();
  if (Array.isArray(chatUsers)) {
    chatUsers.forEach((u) => { if (u?.id) byId.set(u.id, { id: u.id, name: u.name ?? null }); });
  }
  const extras = await fetchJson<any[]>(base, '/api/users', []);
  if (Array.isArray(extras)) {
    extras.forEach((e) => {
      if (!e?.id) return;
      const prev = byId.get(e.id) ?? { id: e.id, name: e.name ?? null };
      byId.set(e.id, {
        id: e.id,
        name: prev.name ?? e.name ?? null,
        role: e.roleSlug ?? e.role ?? null,
        methodicalGroups: e.methodicalGroups ?? null,
        subjects: e.subjects ?? null,
      });
    });
  }
  return Array.from(byId.values());
}

async function getGroups(base: string): Promise<SimpleGroup[]> {
  const first = await fetchJson<SimpleGroup[]>(base, '/api/groups', []);
  if (Array.isArray(first) && first.length) return first;
  const second = await fetchJson<SimpleGroup[]>(base, '/api/chat/groups', []);
  if (Array.isArray(second) && second.length) return second;
  return await fetchJson<SimpleGroup[]>(base, '/api/user-groups', []);
}

async function getTasks(base: string): Promise<Task[]> {
  return await fetchJson<Task[]>(base, '/api/tasks', []);
}

export default async function InboxTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await searchParams; // контракт Next 15
  const { meId } = await requireMe();
  const base = await getOrigin();

  const [users, groups, tasks] = await Promise.all([
    getUsers(base),
    getGroups(base),
    getTasks(base),
  ]);

  return (
    <main style={{ padding: 16, fontFamily: '"Times New Roman", serif', fontSize: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16 }}>
        <section className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Новая задача</div>
          <Suspense fallback={null}>
            <TaskForm
              users={users}
              groups={groups}
              createAction={createTaskAction}
            />
          </Suspense>
        </section>

        <TasksList
          meId={meId}
          tasks={tasks}
          users={users}
          updateAction={updateTaskAction}
          deleteAction={deleteTaskAction}
          markDoneAction={markDoneAction}
        />
      </div>

      <style>{`.card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; } .tile:hover { background:#fafafa; border-color:#d1d5db; }`}</style>
    </main>
  );
}

/* -------- список и карточки (сервер -> формы с server actions) -------- */
function fmtRuDate(iso?: string | null) {
  if (!iso) return '—';
  const x = new Date(iso);
  if (isNaN(+x)) return '—';
  const M = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  const dd = String(x.getDate()).padStart(2, '0');
  return `${dd} ${M[x.getMonth()]} ${x.getFullYear()}`;
}
function tsOf(iso?: string | null) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}
function assigneeIdsOf(t: Task): string[] {
  if (Array.isArray(t.assignedTo) && t.assignedTo.length > 0) {
    return t.assignedTo.filter(a => !a.type || a.type === 'user').map(a => a.id).filter(Boolean);
  }
  if (Array.isArray(t.assignees) && t.assignees.length > 0) {
    return t.assignees.map(a => a.userId).filter(Boolean);
  }
  return [];
}
function myAssigneeStatus(t: Task, myId?: string | null): string | null {
  if (!myId) return null;
  const rec = (t.assignees || []).find(a => a.userId === myId);
  return rec?.status ?? null;
}

function TasksList({
  meId,
  tasks,
  users,
  updateAction,
  deleteAction,
  markDoneAction,
}: {
  meId: string;
  tasks: Task[];
  users: SimpleUser[];
  updateAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
  markDoneAction: (fd: FormData) => Promise<void>;
}) {
  const BRAND = '#8d2828';
  const usersById = new Map<string, string>();
  users.forEach(u => { if (u.id) usersById.set(u.id, u.name || u.id); });

  const sorted = [...tasks].sort((a,b) => tsOf(a.dueDate) - tsOf(b.dueDate));

  function names(t: Task) {
    return assigneeIdsOf(t).map(id => usersById.get(id) || id);
  }

  return (
    <section className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 420 }}>
      <div style={{ padding: 12, borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 800 }}>Задачи</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 8, overflowY: 'auto', padding: 12, maxHeight: '70vh' }}>
        {sorted.length === 0 && <div style={{ padding: 12, color: '#6b7280' }}>Задач пока нет</div>}

        {sorted.map((t) => {
          const urgent = (t.priority || 'normal') === 'high';
          const mine = assigneeIdsOf(t).includes(meId);
          const byMe = t.createdById === meId;

          return (
            <div key={t.id} className="tile" style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
              <details>
                <summary style={{ listStyle: 'none' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      width: '100%',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      borderRadius: 12,
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: 15, color: urgent ? '#c1121f' : '#111827' }}>
                      №{t.seq ?? '—'} · {t.title}
                    </span>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>
                      {t.createdById ? `назначил: ${usersById.get(t.createdById) || t.createdById}` : 'назначивший: —'}
                    </span>
                  </div>
                </summary>

                <div style={{ padding: '0 12px 12px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontSize: 12, color: '#374151' }}>{fmtRuDate(t.dueDate)}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {urgent && <span style={{ fontSize: 11, background: BRAND, color: '#fff', borderRadius: 999, padding: '2px 8px' }}>срочно</span>}
                      {t.hidden && <span title="Эта задача не публикуется в общем календаре" style={{ fontSize: 11, color: '#6b7280', border: '1px dashed #c4c4c4', padding: '2px 8px', borderRadius: 999 }}>вне календаря</span>}
                    </div>
                  </div>

                  {(() => {
                    const ns = names(t);
                    return ns.length ? (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Кому назначено:</div>
                        {ns.map((n, i) => (
                          <span
                            key={i}
                            style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, border: '1px solid #e5e7eb', padding: '2px 8px', borderRadius: 999, marginRight: 6, marginTop: 4 }}
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                    ) : null;
                  })()}

                  {t.description && (
                    <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: '1px solid #e5e7eb', background: '#fcfcfc', borderRadius: 10, padding: '8px 10px' }}>
                      {t.description}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    {byMe && (
                      <>
                        <form action={updateAction} style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                          <input type="hidden" name="id" value={t.id} />
                          <input name="title" defaultValue={t.title} placeholder="Название" style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8 }} />
                          <input name="due" defaultValue={t.dueDate ? String(t.dueDate).slice(0, 10) : ''} type="date" style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8 }} />
                          <select name="priority" defaultValue={(t.priority || 'normal') as string} style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                            <option value="normal">обычный</option>
                            <option value="high">срочно</option>
                          </select>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
                            <input type="checkbox" name="noCalendar" defaultChecked={!!t.hidden} /> вне календаря
                          </label>
                          <button type="submit" style={{ height: 32, padding: '0 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>
                            Сохранить
                          </button>
                        </form>

                        <form action={deleteAction}>
                          <input type="hidden" name="id" value={t.id} />
                          <button
                            type="submit"
                            style={{ height: 32, padding: '0 12px', borderRadius: 10, border: `1px solid ${BRAND}`, background: BRAND, color: '#fff', cursor: 'pointer' }}
                          >
                            Удалить
                          </button>
                        </form>
                      </>
                    )}

                    {mine && myAssigneeStatus(t, meId) !== 'done' && (
                      <form action={markDoneAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <button type="submit" style={{ height: 32, padding: '0 12px', borderRadius: 10, border: '1px solid #10b981', background: '#10b981', color: '#fff', cursor: 'pointer' }}>
                          Выполнено
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </details>
            </div>
          );
        })}
      </div>
    </section>
  );
}

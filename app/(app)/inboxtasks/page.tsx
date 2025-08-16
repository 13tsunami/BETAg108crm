// app/(app)/inboxtasks/page.tsx
import { auth } from '@/auth.config';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import TaskForm from './TaskForm';
import {
  createTaskAction,
  updateTaskAction,
  deleteTaskAction,
  markDoneAction,
} from './actions';
import InboxTasksSearch from './tasks-search-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function InboxTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qt = pickStr(sp.qt);
  const qu = pickStr(sp.qu);

  const session = await auth();
  if (!session?.user) redirect('/');

  const [users, groups] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, role: true, methodicalGroups: true, subjects: true },
      orderBy: [{ name: 'asc' }],
    }),
    prisma.group.findMany({
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }],
    }),
  ]);

  const tasks = await prisma.task.findMany({
    where: {
      AND: [
        qt
          ? {
              OR: [
                { title: { contains: qt, mode: 'insensitive' } },
                { description: { contains: qt, mode: 'insensitive' } },
              ],
            }
          : {},
        qu
          ? {
              assignees: {
                some: {
                  user: { name: { contains: qu, mode: 'insensitive' } },
                },
              },
            }
          : {},
      ],
    },
    select: {
      id: true,
      title: true,
      description: true,
      dueDate: true,
      hidden: true,
      priority: true,
      assignees: { select: { userId: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
  });

  const usersById = new Map(users.map(u => [u.id, u.name ?? u.id]));

  return (
    <main style={{ padding: 16, fontFamily: '"Times New Roman", serif', fontSize: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16 }}>
        <section className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Новая задача</div>
          <TaskForm users={users} groups={groups} createAction={createTaskAction} />
        </section>

        <TasksList
          tasks={tasks}
          usersById={usersById}
          onUpdate={updateTaskAction}
          onDelete={deleteTaskAction}
          onMarkDone={markDoneAction}
        />
      </div>

      <style>{`.card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; } .tile:hover { background:#fafafa; border-color:#d1d5db; }`}</style>

      <section className="card" style={{ marginTop: 16, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Поиск</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <InboxTasksSearch paramKey="qt" placeholder="Поиск по названию и описанию" />
          <InboxTasksSearch paramKey="qu" placeholder="Поиск по ФИО исполнителя" />
        </div>
      </section>
    </main>
  );
}

type Task = {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | string | null;
  hidden: boolean | null;
  priority: string | null;
  assignees: { userId: string }[];
};

function TasksList({
  tasks,
  usersById,
  onUpdate,
  onDelete,
  onMarkDone,
}: {
  tasks: Task[];
  usersById: Map<string, string>;
  onUpdate: (fd: FormData) => Promise<void>;
  onDelete: (fd: FormData) => Promise<void>;
  onMarkDone: (fd: FormData) => Promise<void>;
}) {
  const BRAND = '#8d2828';

  const sorted = [...tasks].sort((a, b) => tsOf(a.dueDate) - tsOf(b.dueDate));

  return (
    <section className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 420 }}>
      <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 8, overflowY: 'auto', padding: 12, maxHeight: '70vh' }}>
        {sorted.length === 0 && <div style={{ padding: 12, color: '#6b7280' }}>Задач по запросу не найдено</div>}

        {sorted.map((t) => {
          const urgent = (t.priority || 'normal') === 'high';
          const assigneeNames = t.assignees.map(a => usersById.get(a.userId) || a.userId);

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
                      {t.title}
                    </span>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{fmtRuDate(t.dueDate)}</span>
                  </div>
                </summary>

                <div style={{ padding: '0 12px 12px 12px' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {urgent && <span style={{ fontSize: 11, background: BRAND, color: '#fff', borderRadius: 999, padding: '2px 8px' }}>срочно</span>}
                    {t.hidden && <span title="Эта задача не публикуется в общем календаре" style={{ fontSize: 11, color: '#6b7280', border: '1px dashed #c4c4c4', padding: '2px 8px', borderRadius: 999 }}>вне календаря</span>}
                  </div>

                  {assigneeNames.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Кому назначено:</div>
                      {assigneeNames.map((n, i) => (
                        <span
                          key={i}
                          style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, border: '1px solid #e5e7eb', padding: '2px 8px', borderRadius: 999, marginRight: 6, marginTop: 4 }}
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  )}

                  {t.description && (
                    <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: '1px solid #e5e7eb', background: '#fcfcfc', borderRadius: 10, padding: '8px 10px' }}>
                      {t.description}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <form action={onUpdate} style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
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

                    <form action={onDelete}>
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        style={{ height: 32, padding: '0 12px', borderRadius: 10, border: `1px solid ${BRAND}`, background: BRAND, color: '#fff', cursor: 'pointer' }}
                      >
                        Удалить
                      </button>
                    </form>

                    <form action={onMarkDone}>
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" style={{ height: 32, padding: '0 12px', borderRadius: 10, border: '1px solid #10b981', background: '#10b981', color: '#fff', cursor: 'pointer' }}>
                        Выполнено
                      </button>
                    </form>
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

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  if (typeof v === 'string' && v.trim() !== '') return v;
  return undefined;
}

function tsOf(iso?: Date | string | null) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(String(iso));
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

function fmtRuDate(iso?: Date | string | null) {
  if (!iso) return '—';
  const x = new Date(iso);
  if (isNaN(+x)) return '—';
  const M = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  const dd = String(x.getDate()).padStart(2, '0');
  return `${dd} ${M[x.getMonth()]} ${x.getFullYear()}`;
}

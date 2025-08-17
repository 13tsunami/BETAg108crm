// app/inboxtasks/page.tsx
import { Suspense } from 'react';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks } from '@/lib/roles';
import TaskForm from './TaskForm';
import {
  createTaskAction,
  updateTaskAction,
  deleteTaskAction,
  markAssigneeDoneAction,
} from './actions';
import type { Prisma } from '@prisma/client';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type TaskWithAssignees = Prisma.TaskGetPayload<{ include: { assignees: true } }>;

function fmtRuDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(dt);
}

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const tabParam = typeof sp.tab === 'string' ? sp.tab : Array.isArray(sp.tab) ? sp.tab[0] : undefined;

  const session = await auth();
  const meId = session?.user?.id ?? null;
  const meName = session?.user?.name ?? null;
  const role = normalizeRole(session?.user?.role);
  const mayCreate = canCreateTasks(role);

  if (!meId) {
    return (
      <main style={{ padding: 16 }}>
        <h1>Задачи</h1>
        <p>Не авторизовано.</p>
      </main>
    );
  }

  const activeTab = mayCreate ? (tabParam === 'byme' ? 'byme' : 'mine') : 'mine';

  let users: Array<{ id: string; name: string | null; role?: string | null; methodicalGroups?: string | null; subjects?: any }> = [];
  let groups: Array<{ id: string; name: string }> = [];
  let subjects: Array<{ name: string; count?: number }> = [];
  let groupMembers: Array<{ groupId: string; userId: string }> = [];
  let subjectMembers: Array<{ subjectName: string; userId: string }> = [];

  if (mayCreate) {
    const [usersRaw, groupsRaw, subjectsRaw, groupMembersRaw, subjectMembersRaw] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          role: true,
          methodicalGroups: true,
          subjects: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.group.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.subject.findMany({
        select: { name: true, _count: { select: { members: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.groupMember.findMany({ select: { groupId: true, userId: true } }),
      prisma.subjectMember.findMany({
        select: {
          userId: true,
          subject: { select: { name: true } },
        },
      }),
    ]);

    users = usersRaw;
    groups = groupsRaw;
    subjects = subjectsRaw.map((s) => ({ name: s.name, count: s._count.members }));
    groupMembers = groupMembersRaw;
    subjectMembers = subjectMembersRaw.map((sm) => ({ userId: sm.userId, subjectName: sm.subject.name }));
  }

  const [assignedToMe, createdByMe]: [TaskWithAssignees[], TaskWithAssignees[]] = await Promise.all([
    prisma.task.findMany({
      where: {
        assignees: { some: { userId: meId, status: 'in_progress' } },
      },
      include: {
        assignees: true,
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    }),
    mayCreate
      ? prisma.task.findMany({
          where: { createdById: meId },
          include: { assignees: true },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        })
      : Promise.resolve([] as TaskWithAssignees[]),
  ]);

  return (
    <main style={{ display: 'grid', gap: 12, padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Задачи</h1>
        {mayCreate ? (
          <nav style={{ display: 'flex', gap: 8 }}>
            <a
              href="/inboxtasks?tab=mine"
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: '1px solid #e5e7eb',
                background: activeTab === 'mine' ? '#111827' : '#fff',
                color: activeTab === 'mine' ? '#fff' : '#111827',
                textDecoration: 'none',
                fontSize: 13,
              }}
            >
              Назначенные мне ({assignedToMe.length})
            </a>
            <a
              href="/inboxtasks?tab=byme"
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: '1px solid #e5e7eb',
                background: activeTab === 'byme' ? '#111827' : '#fff',
                color: activeTab === 'byme' ? '#fff' : '#111827',
                textDecoration: 'none',
                fontSize: 13,
              }}
            >
              Назначенные мной ({createdByMe.length})
            </a>
          </nav>
        ) : (
          <div style={{ fontSize: 13, color: '#6b7280' }}>Роль: преподаватель — доступна только вкладка «Назначенные мне»</div>
        )}
      </header>

      {mayCreate && (
        <section aria-label="Создать задачу" style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
          <Suspense fallback={null}>
            <TaskForm
              users={users}
              groups={groups}
              subjects={subjects}
              groupMembers={groupMembers}
              subjectMembers={subjectMembers}
              createAction={createTaskAction}
            />
          </Suspense>
        </section>
      )}

      {activeTab === 'mine' && (
        <section aria-label="Назначенные мне" style={{ display: 'grid', gap: 8 }}>
          {assignedToMe.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>Пока нет активных задач.</div>}
          {assignedToMe.map((t) => {
            const myAssn = t.assignees.find((a) => a.userId === meId);
            const urgent = (t.priority ?? 'normal') === 'high';
            return (
              <details key={t.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
                <summary style={{ padding: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{t.title}</span>
                    {urgent && (
                      <span style={{ fontSize: 11, color: '#8d2828', border: '1px solid #8d2828', borderRadius: 999, padding: '0 6px' }}>
                        Срочно
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#374151' }}>{fmtRuDate(t.dueDate as Date)}</div>
                </summary>
                <div style={{ padding: 10, borderTop: '1px solid #f3f4f6' }}>
                  {t.description && (
                    <div style={{ whiteSpace: 'pre-wrap', color: '#111827', marginBottom: 8 }}>{t.description}</div>
                  )}

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <form action={markAssigneeDoneAction}>
                      <input type="hidden" name="taskId" value={t.id} />
                      <button
                        type="submit"
                        style={{
                          height: 32,
                          padding: '0 12px',
                          borderRadius: 10,
                          border: '1px solid #10b981',
                          background: '#10b981',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                        disabled={!myAssn || myAssn.status === 'done'}
                      >
                        Выполнить
                      </button>
                    </form>
                    {t.createdById && (
                      <a
                        href={`/chat?userId=${encodeURIComponent(t.createdById)}`}
                        style={{
                          height: 32,
                          padding: '0 12px',
                          borderRadius: 10,
                          border: '1px solid #e5e7eb',
                          background: '#fff',
                          color: '#111827',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          fontSize: 13,
                        }}
                      >
                        Уточнить задачу
                      </a>
                    )}
                    <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>
                      Назначил: {t.createdByName ?? '—'}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </section>
      )}

      {activeTab === 'byme' && mayCreate && (
        <section aria-label="Назначенные мной" style={{ display: 'grid', gap: 8 }}>
          {createdByMe.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>Вы пока не создавали задач.</div>}
          {createdByMe.map((t) => {
            const urgent = (t.priority ?? 'normal') === 'high';
            const allDone = t.assignees.length > 0 && t.assignees.every((a) => a.status === 'done');
            return (
              <details key={t.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
                <summary style={{ padding: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{t.title}</span>
                    {urgent && (
                      <span style={{ fontSize: 11, color: '#8d2828', border: '1px solid #8d2828', borderRadius: 999, padding: '0 6px' }}>
                        Срочно
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#374151' }}>{fmtRuDate(t.dueDate as Date)}</div>
                </summary>
                <div style={{ padding: 10, borderTop: '1px solid #f3f4f6', display: 'grid', gap: 10 }}>
                  {/* Исполнители и статусы */}
                  <div style={{ fontSize: 13 }}>
                    <div style={{ color: '#6b7280', marginBottom: 4 }}>Кому назначено:</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {t.assignees.map((a) => (
                        <span
                          key={a.id}
                          title={a.status === 'done' ? 'Выполнено' : 'В работе'}
                          style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: 999,
                            padding: '2px 8px',
                            fontSize: 12,
                            background: a.status === 'done' ? '#ecfdf5' : '#fff',
                          }}
                        >
                          {a.userId.slice(0, 8)}… {a.status === 'done' ? '✓' : ''}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Простейшее редактирование основных полей */}
                  <form action={updateTaskAction} style={{ display: 'grid', gap: 8 }}>
                    <input type="hidden" name="taskId" value={t.id} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 140px', gap: 8 }}>
                      <input
                        name="title"
                        defaultValue={t.title}
                        placeholder="Название"
                        style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8 }}
                      />
                      <input
                        name="dueDate"
                        type="date"
                        defaultValue={new Date(t.dueDate as Date).toISOString().slice(0, 10)}
                        style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8 }}
                      />
                      <select name="priority" defaultValue={t.priority ?? 'normal'} style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                        <option value="normal">обычный</option>
                        <option value="high">срочно</option>
                      </select>
                    </div>
                    <textarea
                      name="description"
                      defaultValue={t.description ?? ''}
                      rows={3}
                      placeholder="Описание"
                      style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical' }}
                    />
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <input type="checkbox" name="hidden" defaultChecked={t.hidden ?? false} /> не размещать в календаре
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="submit"
                        style={{
                          height: 32,
                          padding: '0 12px',
                          borderRadius: 10,
                          border: '1px solid #111827',
                          background: '#111827',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        Сохранить
                      </button>
                      <form action={deleteTaskAction}>
                        <input type="hidden" name="taskId" value={t.id} />
                        <button
                          type="submit"
                          style={{
                            height: 32,
                            padding: '0 12px',
                            borderRadius: 10,
                            border: '1px solid #ef4444',
                            background: '#ef4444',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: 13,
                          }}
                        >
                          Удалить
                        </button>
                      </form>
                      {allDone && (
                        <form action={updateTaskAction} style={{ marginLeft: 'auto' }}>
                          <input type="hidden" name="taskId" value={t.id} />
                          <input type="hidden" name="archive" value="1" />
                          <button
                            type="submit"
                            title="Переместить в архив (все исполнители выполнили)"
                            style={{
                              height: 32,
                              padding: '0 12px',
                              borderRadius: 10,
                              border: '1px solid #10b981',
                              background: '#10b981',
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: 13,
                            }}
                          >
                            В архив
                          </button>
                        </form>
                      )}
                    </div>
                  </form>
                </div>
              </details>
            );
          })}
        </section>
      )}
    </main>
  );
}

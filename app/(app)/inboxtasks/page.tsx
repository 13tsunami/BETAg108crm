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
type TaskWithAssignees = Prisma.TaskGetPayload<{
  include: { assignees: { include: { user: { select: { id: true; name: true } } } } }
}>;

function fmtRuDateWithOptionalTimeYekb(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).formatToParts(dt);

  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const dd = `${map.day} ${map.month?.replace('.', '')}`;
  const yyyy = map.year;

  const hm = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(dt);
  const hh = hm.find(p => p.type === 'hour')?.value ?? '00';
  const mm = hm.find(p => p.type === 'minute')?.value ?? '00';

  const isDefaultEnd = hh === '23' && mm === '59';
  return isDefaultEnd ? `${dd} ${yyyy}` : `${dd} ${yyyy}, ${hh}:${mm}`;
}

function TeacherGuide() {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff', fontSize: 14, lineHeight: 1.5 }}>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>Как работать с задачами</h3>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>Во вкладке «Назначенные мне» вы видите актуальные задачи, назначенные вам руководителями.</li>
        <li>Откройте задачу и нажмите «Выполнить», когда закончите работу — она уйдёт в архив.</li>
        <li>Кнопка «Уточнить задачу» открывает чат с назначившим задачу для вопросов и уточнений.</li>
        <li>Дедлайн отображается с датой и, при необходимости, временем.</li>
      </ul>
    </div>
  );
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

  // Данные для TaskForm
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

  // Списки задач
  const [assignedToMe, createdByMe]: [TaskWithAssignees[], TaskWithAssignees[]] = await Promise.all([
    prisma.task.findMany({
      where: {
        assignees: { some: { userId: meId, status: 'in_progress' } },
      },
      include: {
        assignees: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    }),
    mayCreate
      ? prisma.task.findMany({
          where: { createdById: meId },
          include: { assignees: { include: { user: { select: { id: true, name: true } } } } },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        })
      : Promise.resolve([] as TaskWithAssignees[]),
  ]);

  return (
    <main style={{ padding: 16 }}>
      <div className="gridWrap">
        {/* Левая колонка: форма (или гид для Teacher) */}
        <aside className="leftCol">
          {mayCreate ? (
            <section aria-label="Создать задачу" className="card">
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
          ) : (
            <TeacherGuide />
          )}
        </aside>

        {/* Правая колонка: список задач с табами */}
        <section className="rightCol">
          <header className="tabsWrap">
            {mayCreate ? (
              <nav className="tabs">
                <a
                  href="/inboxtasks?tab=mine"
                  className={`tab ${activeTab === 'mine' ? 'tab--active' : ''}`}
                  aria-current={activeTab === 'mine' ? 'page' : undefined}
                >
                  Назначенные мне ({assignedToMe.length})
                </a>
                <a
                  href="/inboxtasks?tab=byme"
                  className={`tab ${activeTab === 'byme' ? 'tab--active' : ''}`}
                  aria-current={activeTab === 'byme' ? 'page' : undefined}
                >
                  Назначенные мной ({createdByMe.length})
                </a>
              </nav>
            ) : (
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                Роль: преподаватель — доступна только вкладка «Назначенные мне»
              </div>
            )}
          </header>

          {/* Вкладка: Назначенные мне */}
          {activeTab === 'mine' && (
            <section aria-label="Назначенные мне" style={{ display: 'grid', gap: 8 }}>
              {assignedToMe.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>Пока нет активных задач.</div>}
              {assignedToMe.map((t) => {
                const myAssn = t.assignees.find((a) => a.userId === meId);
                const urgent = (t.priority ?? 'normal') === 'high';
                return (
                  <details key={t.id} className="taskCard">
                    <summary className="taskSummary">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>{t.title}</span>
                        {urgent && (
                          <span className="pillUrgent">Срочно</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#374151' }}>
                        {fmtRuDateWithOptionalTimeYekb(t.dueDate as Date)}
                      </div>
                    </summary>
                    <div className="taskBody">
                      {t.description && (
                        <div style={{ whiteSpace: 'pre-wrap', color: '#111827', marginBottom: 8 }}>{t.description}</div>
                      )}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <form action={markAssigneeDoneAction}>
                          <input type="hidden" name="taskId" value={t.id} />
                          <button
                            type="submit"
                            className="btnPrimaryGreen"
                            disabled={!myAssn || myAssn.status === 'done'}
                          >
                            Выполнить
                          </button>
                        </form>
                        {t.createdById && (
                          <a
                            href={`/chat?userId=${encodeURIComponent(t.createdById)}`}
                            className="btnGhost"
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

          {/* Вкладка: Назначенные мной */}
          {activeTab === 'byme' && mayCreate && (
            <section aria-label="Назначенные мной" style={{ display: 'grid', gap: 8 }}>
              {createdByMe.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>Вы пока не создавали задач.</div>}
              {createdByMe.map((t) => {
                const urgent = (t.priority ?? 'normal') === 'high';
                const total = t.assignees.length;
                const done = t.assignees.filter(a => a.status === 'done').length;
                const allDone = total > 0 && done === total;

                const sorted = [...t.assignees].sort((a, b) => {
                  const av = a.status === 'done' ? 1 : 0;
                  const bv = b.status === 'done' ? 1 : 0;
                  return av - bv;
                });

                const preview = sorted.slice(0, 7);
                const hasMore = sorted.length > 7;

                return (
                  <details key={t.id} className="taskCard">
                    <summary className="taskSummary">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>{t.title}</span>
                        {urgent && <span className="pillUrgent">Срочно</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#374151' }}>
                        <span>{fmtRuDateWithOptionalTimeYekb(t.dueDate as Date)}</span>
                        <span style={{ color: '#111827', fontWeight: 600 }}>{done}/{total} выполнено</span>
                      </div>
                    </summary>

                    <div className="taskBody" style={{ display: 'grid', gap: 10 }}>
                      {/* Кому назначено (сворачиваемый список) */}
                      <div style={{ fontSize: 13 }}>
                        <div style={{ color: '#6b7280', marginBottom: 4 }}>Кому назначено:</div>

                        {hasMore ? (
                          <details>
                            <summary style={{ listStyle: 'none', cursor: 'pointer' }}>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {preview.map((a) => (
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
                                    {(a.user?.name ?? `${a.userId.slice(0,8)}…`)} {a.status === 'done' ? '✓' : ''}
                                  </span>
                                ))}
                              </div>
                              <div style={{ marginTop: 6, fontSize: 12, color: '#374151' }}>Показать всех</div>
                            </summary>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                              {sorted.map((a) => (
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
                                  {(a.user?.name ?? `${a.userId.slice(0,8)}…`)} {a.status === 'done' ? '✓' : ''}
                                </span>
                              ))}
                            </div>
                          </details>
                        ) : (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {sorted.map((a) => (
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
                                {(a.user?.name ?? `${a.userId.slice(0,8)}…`)} {a.status === 'done' ? '✓' : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Редактирование основных полей */}
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
                          <input type="checkbox" name="hidden" defaultChecked={t['hidden'] ?? false} /> не размещать в календаре
                        </label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="submit" className="btnPrimary">
                            Сохранить изменения
                          </button>
                        </div>
                      </form>

                      {/* Кнопки Удалить / В архив — отдельные формы */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <form action={deleteTaskAction}>
                          <input type="hidden" name="taskId" value={t.id} />
                          <button type="submit" className="btnDanger">
                            Удалить
                          </button>
                        </form>
                        {allDone && (
                          <form action={updateTaskAction} style={{ marginLeft: 'auto' }}>
                            <input type="hidden" name="taskId" value={t.id} />
                            <input type="hidden" name="archive" value="1" />
                            <button type="submit" className="btnPrimaryGreen">
                              В архив
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
            </section>
          )}
        </section>
      </div>

      {/* ВАЖНО: обычный <style>, НЕ styled-jsx */}
      <style>{`
        /* 1/3 + 2/3 на широких экранах */
        .gridWrap {
          display: grid;
          grid-template-columns: 1fr 2fr; /* ровно 1/3 : 2/3 */
          gap: 12px;
          align-items: start;
        }
        /* ограничим чрезмерный разлет левой колонки */
        .leftCol { min-width: 340px; }
        .rightCol { min-width: 0; }

        /* На узких экранах переносим задачи под форму */
        @media (max-width: 980px) {
          .gridWrap { grid-template-columns: 1fr; }
          .leftCol { min-width: 0; }
        }

        /* Карточка формы */
        .card { border:1px solid #e5e7eb; border-radius:12px; padding:12px; background:#fff; }

        /* Инпуты/textarea/select внутри формы — по ширине карточки */
        .card input,
        .card textarea,
        .card select {
          width: 100%;
          box-sizing: border-box;
          max-width: 100%;
        }

        .tabsWrap { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .tabs { display:flex; gap:8px; flex-wrap: wrap; }
        .tab {
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #111827;
          text-decoration: none;
          font-size: 13px;
        }
        .tab--active {
          background: #8d2828;
          color: #fff;
          border-color: #8d2828;
        }

        .taskCard { border:1px solid #e5e7eb; border-radius:12px; background:#fff; }
        .taskSummary { padding:10px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; }
        .taskBody { padding:10px; border-top:1px solid #f3f4f6; }

        .pillUrgent { font-size:11px; color:#8d2828; border:1px solid #8d2828; border-radius:999px; padding:0 6px; }

        .btnPrimary {
          height:32px; padding:0 12px; border-radius:10px; border:1px solid #111827; background:#111827; color:#fff; cursor:pointer; font-size:13px;
        }
        .btnPrimaryGreen {
          height:32px; padding:0 12px; border-radius:10px; border:1px solid #10b981; background:#10b981; color:#fff; cursor:pointer; font-size:13px;
        }
        .btnDanger {
          height:32px; padding:0 12px; border-radius:10px; border:1px solid #ef4444; background:#ef4444; color:#fff; cursor:pointer; font-size:13px;
        }
        .btnGhost {
          height:32px; padding:0 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; color:#111827;
          text-decoration:none; display:inline-flex; align-items:center; font-size:13px;
        }
      `}</style>
    </main>
  );
}

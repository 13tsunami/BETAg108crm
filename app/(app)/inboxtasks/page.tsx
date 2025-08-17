// app/(app)/inboxtasks/page.tsx
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
type TaskWithAssigneesAndUsers = Prisma.TaskGetPayload<{
  include: { assignees: { include: { user: { select: { id: true; name: true } } } } };
}>;

const BRAND = '#8d2828';

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

  // Данные для TaskForm (только если можно создавать задачи)
  let users: Array<{ id: string; name: string | null; role?: string | null; methodicalGroups?: string | null; subjects?: any }> = [];
  let groups: Array<{ id: string; name: string }> = [];
  let subjects: Array<{ name: string; count?: number }> = [];
  let groupMembers: Array<{ groupId: string; userId: string }> = [];
  let subjectMembers: Array<{ subjectName: string; userId: string }> = [];

  if (mayCreate) {
    const [usersRaw, groupsRaw, subjectsRaw, groupMembersRaw, subjectMembersRaw] = await Promise.all([
      prisma.user.findMany({
        select: { id: true, name: true, role: true, methodicalGroups: true, subjects: true },
        orderBy: { name: 'asc' },
      }),
      prisma.group.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.subject.findMany({
        select: { name: true, _count: { select: { members: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.groupMember.findMany({ select: { groupId: true, userId: true } }),
      prisma.subjectMember.findMany({
        select: { userId: true, subject: { select: { name: true } } },
      }),
    ]);

    users = usersRaw;
    groups = groupsRaw;
    subjects = subjectsRaw.map((s) => ({ name: s.name, count: s._count.members }));
    groupMembers = groupMembersRaw;
    subjectMembers = subjectMembersRaw.map((sm) => ({ userId: sm.userId, subjectName: sm.subject.name }));
  }

  // Списки задач
  const [assignedToMe, createdByMe]: [TaskWithAssigneesAndUsers[], TaskWithAssigneesAndUsers[]] = await Promise.all([
    prisma.task.findMany({
      where: { assignees: { some: { userId: meId, status: 'in_progress' } } },
      include: { assignees: { include: { user: { select: { id: true, name: true } } } } },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    }),
    mayCreate
      ? prisma.task.findMany({
          where: { createdById: meId },
          include: { assignees: { include: { user: { select: { id: true, name: true } } } } },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        })
      : Promise.resolve([] as TaskWithAssigneesAndUsers[]),
  ]);

  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ margin: '0 0 12px' }}>Задачи</h1>

      {/* Двухколоночный лэйаут 1/3 + 2/3 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 1fr) 2fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* Левая колонка (1/3): TaskForm ИЛИ обучающий текст для teacher */}
        <section
          aria-label={mayCreate ? 'Создать задачу' : 'Как работать с задачами'}
          style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}
        >
          {mayCreate ? (
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
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Как пользоваться задачами</h2>
              <p style={{ margin: 0, color: '#374151', fontSize: 14 }}>
                Вы видите задачи, которые вам назначили. Отметьте задачу как «Выполнить», когда закончите работу —
                она переместится в архив. Для уточнений нажмите «Уточнить задачу» — откроется чат с назначившим.
              </p>
              <p style={{ margin: 0, color: '#374151', fontSize: 14 }}>
                Срок задачи указан на карточке. Срочные задачи помечены бейджем «Срочно». Ваш календарь автоматически
                показывает задачи по датам (если задача не скрыта из календаря).
              </p>
            </div>
          )}
        </section>

        {/* Правая колонка (2/3): вкладки и списки */}
        <section aria-label="Список задач" style={{ display: 'grid', gap: 12 }}>
          {/* Табы */}
          <nav style={{ display: 'flex', gap: 8 }}>
            <a
              href="/inboxtasks?tab=mine"
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: '1px solid #e5e7eb',
                background: activeTab === 'mine' ? BRAND : '#fff',
                color: activeTab === 'mine' ? '#fff' : '#111827',
                textDecoration: 'none',
                fontSize: 13,
              }}
            >
              Назначенные мне ({assignedToMe.length})
            </a>
            {mayCreate && (
              <a
                href="/inboxtasks?tab=byme"
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid #e5e7eb',
                  background: activeTab === 'byme' ? BRAND : '#fff',
                  color: activeTab === 'byme' ? '#fff' : '#111827',
                  textDecoration: 'none',
                  fontSize: 13,
                }}
              >
                Назначенные мной ({createdByMe.length})
              </a>
            )}
          </nav>

          {/* Вкладка «Назначенные мне» */}
          {activeTab === 'mine' && (
            <section aria-label="Назначенные мне" style={{ display: 'grid', gap: 8 }}>
              {assignedToMe.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>Пока нет активных задач.</div>}
              {assignedToMe.map((t) => {
                const myAssn = t.assignees.find((a) => a.user?.id === meId);
                const urgent = (t as any).priority === 'high'; // при сохранении мы не меняли схему, значение есть
                return (
                  <details key={t.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
                    <summary style={{ padding: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>{(t as any).title}</span>
                        {urgent && (
                          <span style={{ fontSize: 11, color: BRAND, border: `1px solid ${BRAND}`, borderRadius: 999, padding: '0 6px' }}>
                            Срочно
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#374151' }}>{fmtRuDate((t as any).dueDate as Date)}</div>
                    </summary>
                    <div style={{ padding: 10, borderTop: '1px solid #f3f4f6' }}>
                      {(t as any).description && (
                        <div style={{ whiteSpace: 'pre-wrap', color: '#111827', marginBottom: 8 }}>{(t as any).description}</div>
                      )}

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
                            disabled={!myAssn || (myAssn as any).status === 'done'}
                          >
                            Выполнить
                          </button>
                        </form>
                        {(t as any).createdById && (
                          <a
                            href={`/chat?userId=${encodeURIComponent((t as any).createdById as string)}`}
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
                          Назначил: {(t as any).createdByName ?? '—'}
                        </div>
                      </div>
                    </div>
                  </details>
                );
              })}
            </section>
          )}

          {/* Вкладка «Назначенные мной» */}
          {activeTab === 'byme' && mayCreate && (
            <section aria-label="Назначенные мной" style={{ display: 'grid', gap: 8 }}>
              {createdByMe.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>Вы пока не создавали задач.</div>}

              {createdByMe.map((t) => {
                const urgent = (t as any).priority === 'high';
                const allDone = t.assignees.length > 0 && t.assignees.every((a) => (a as any).status === 'done');

                const progressTarget = `progress-${t.id}`;

                return (
                  <details key={t.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
                    <summary style={{ padding: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>{(t as any).title}</span>
                        {urgent && (
                          <span style={{ fontSize: 11, color: BRAND, border: `1px solid ${BRAND}`, borderRadius: 999, padding: '0 6px' }}>
                            Срочно
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#374151' }}>{fmtRuDate((t as any).dueDate as Date)}</div>
                    </summary>

                    <div style={{ padding: 10, borderTop: '1px solid #f3f4f6', display: 'grid', gap: 10 }}>
                      {/* Исполнители и статусы (ФИО) */}
                      <div style={{ fontSize: 13 }}>
                        <div style={{ color: '#6b7280', marginBottom: 4 }}>Кому назначено:</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {t.assignees.map((a) => (
                            <span
                              key={a.id}
                              title={(a as any).status === 'done' ? 'Выполнено' : 'В работе'}
                              style={{
                                border: '1px solid #e5e7eb',
                                borderRadius: 999,
                                padding: '2px 8px',
                                fontSize: 12,
                                background: (a as any).status === 'done' ? '#ecfdf5' : '#fff',
                              }}
                            >
                              {a.user?.name ?? `${a.user?.id?.slice(0, 8) ?? '—'}…`}{' '}
                              {(a as any).status === 'done' ? '✓' : ''}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Редактирование — отдельная форма */}
                      <form action={updateTaskAction} style={{ display: 'grid', gap: 8 }}>
                        <input type="hidden" name="taskId" value={t.id} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 140px', gap: 8 }}>
                          <input
                            name="title"
                            defaultValue={(t as any).title}
                            placeholder="Название"
                            style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8 }}
                          />
                          <input
                            name="dueDate"
                            type="date"
                            defaultValue={new Date((t as any).dueDate as Date).toISOString().slice(0, 10)}
                            style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8 }}
                          />
                          <select
                            name="priority"
                            defaultValue={(t as any).priority ?? 'normal'}
                            style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8 }}
                          >
                            <option value="normal">обычный</option>
                            <option value="high">срочно</option>
                          </select>
                        </div>
                        <textarea
                          name="description"
                          defaultValue={(t as any).description ?? ''}
                          rows={3}
                          placeholder="Описание"
                          style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical' }}
                        />
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                          <input type="checkbox" name="hidden" defaultChecked={(t as any).hidden ?? false} /> не размещать в календаре
                        </label>

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                            Сохранить изменения
                          </button>
                        </div>
                      </form>

                      {/* Панель действий — отдельные, НЕ вложенные формы */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <form
                          action={deleteTaskAction}
                          onSubmit={(e) => {
                            if (!confirm('Удалить задачу из базы? Действие необратимо.')) e.preventDefault();
                          }}
                        >
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
                          <form action={updateTaskAction}>
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

                        {/* Кнопка «Прогресс» — открывает CSS-модалку через :target */}
                        <a
                          href={`#${progressTarget}`}
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
                          Прогресс
                        </a>
                      </div>
                    </div>

                    {/* CSS-модалка прогресса (без JS, через :target) */}
                    <div id={progressTarget} style={{ position: 'fixed', inset: 0, display: 'none' }}>
                      <a href="/inboxtasks?tab=byme" aria-label="Закрыть" style={{ position: 'absolute', inset: 0 }} />
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(0,0,0,.25)',
                          display: 'grid',
                          placeItems: 'center',
                          padding: 12,
                        }}
                      >
                        <div
                          role="dialog"
                          aria-modal="true"
                          style={{
                            width: 'min(640px, 96vw)',
                            background: '#fff',
                            border: '1px solid #e5e7eb',
                            borderRadius: 12,
                            boxShadow: '0 10px 30px rgba(0,0,0,.15)',
                            padding: 16,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div style={{ fontWeight: 700, fontSize: 16 }}>Прогресс по задаче</div>
                            <a
                              href="/inboxtasks?tab=byme"
                              style={{
                                border: '1px solid #e5e7eb',
                                borderRadius: 8,
                                padding: '4px 8px',
                                textDecoration: 'none',
                                color: '#111827',
                              }}
                            >
                              закрыть
                            </a>
                          </div>

                          <div style={{ display: 'grid', gap: 8 }}>
                            {t.assignees.map((a) => (
                              <div
                                key={a.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  border: '1px solid #f3f4f6',
                                  borderRadius: 8,
                                  padding: '6px 8px',
                                }}
                              >
                                <div style={{ fontSize: 14 }}>
                                  {a.user?.name ?? `${a.user?.id?.slice(0, 8) ?? '—'}…`}
                                </div>
                                <div style={{ fontSize: 13, color: (a as any).status === 'done' ? '#10b981' : '#6b7280' }}>
                                  {(a as any).status === 'done' ? 'Выполнено' : 'В работе'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <style>{`
                        :target#${progressTarget} { display:block; }
                      `}</style>
                    </div>
                  </details>
                );
              })}
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

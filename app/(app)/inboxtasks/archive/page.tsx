// app/(app)/inboxtasks/archive/page.tsx
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks } from '@/lib/roles';
import type { Prisma, TaskAssignee, Task } from '@prisma/client';
import { deleteTaskAction, unarchiveAssigneeAction } from '../actions';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type TaskWithAssigneesAndUsers = Prisma.TaskGetPayload<{
  include: { assignees: { include: { user: { select: { id: true; name: true } } } } };
}>;

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
        <h1>Архив задач</h1>
        <p>Не авторизовано.</p>
      </main>
    );
  }

  const activeTab = mayCreate ? (tabParam === 'byme' ? 'byme' : 'mine') : 'mine';

  const [mineAssigneesDone, byMeAllDone]: [
    (TaskAssignee & { task: Task | null })[],
    TaskWithAssigneesAndUsers[]
  ] = await Promise.all([
    prisma.taskAssignee.findMany({
      where: { userId: meId, status: 'done' },
      include: { task: true },
      orderBy: [{ completedAt: 'desc' }, { assignedAt: 'desc' }],
    }),
    mayCreate
      ? prisma.task.findMany({
          where: { createdById: meId, assignees: { every: { status: 'done' } } },
          include: { assignees: { include: { user: { select: { id: true, name: true } } } } },
          orderBy: [{ dueDate: 'desc' }, { updatedAt: 'desc' }],
        })
      : Promise.resolve([] as TaskWithAssigneesAndUsers[]),
  ]);

  return (
    <main style={{ display: 'grid', gap: 12, padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Архив задач</h1>

        {mayCreate ? (
          <nav style={{ display: 'flex', gap: 8 }}>
            <a
              href="/inboxtasks/archive?tab=mine"
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
              Назначенные мне ({mineAssigneesDone.length})
            </a>
            <a
              href="/inboxtasks/archive?tab=byme"
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
              Назначенные мной ({byMeAllDone.length})
            </a>
          </nav>
        ) : (
          <div style={{ fontSize: 13, color: '#6b7280' }}>Роль: преподаватель — доступен только раздел «Назначенные мне»</div>
        )}
      </header>

      {/* Вкладка: Назначенные мне (завершенные мной) */}
      {activeTab === 'mine' && (
        <section aria-label="Назначенные мне — архив" style={{ display: 'grid', gap: 8 }}>
          {mineAssigneesDone.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>В архиве пока пусто.</div>}

          {mineAssigneesDone.map((a) => {
            const t = a.task;
            const urgent = (t?.priority ?? 'normal') === 'high';
            return (
              <details key={a.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
                <summary style={{ padding: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{t?.title ?? 'Без названия'}</span>
                    {urgent && (
                      <span style={{ fontSize: 11, color: '#8d2828', border: '1px solid #8d2828', borderRadius: 999, padding: '0 6px' }}>
                        Срочно
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: '#374151' }}>
                    <span>Срок: {fmtRuDate(t?.dueDate as Date | undefined)}</span>
                    <span>Выполнено: {fmtRuDate(a.completedAt as Date | undefined)}</span>
                  </div>
                </summary>
                <div style={{ padding: 10, borderTop: '1px solid #f3f4f6' }}>
                  {t?.description && <div style={{ whiteSpace: 'pre-wrap', color: '#111827', marginBottom: 8 }}>{t.description}</div>}
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Назначил: {t?.createdByName ?? '—'}</div>

                  {/* Отдельные формы, НЕ вложенные */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <form action={unarchiveAssigneeAction}>
                      <input type="hidden" name="assigneeId" value={a.id} />
                      <input type="hidden" name="taskId" value={t?.id ?? ''} />
                      <button
                        type="submit"
                        style={{
                          height: 32, padding: '0 12px', borderRadius: 10, border: '1px solid #e5e7eb',
                          background: '#fff', cursor: 'pointer', fontSize: 13,
                        }}
                        title="Вернуть задачу во входящие"
                      >
                        Разархивировать
                      </button>
                    </form>

                    {t?.id && (
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
                            height: 32, padding: '0 12px', borderRadius: 10, border: '1px solid #e5e7eb',
                            background: '#fff', cursor: 'pointer', fontSize: 13, color: '#8d2828',
                          }}
                          title="Удалить задачу (нужны права)"
                        >
                          Удалить из базы
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

      {/* Вкладка: Назначенные мной (все исполнители завершили) */}
      {activeTab === 'byme' && mayCreate && (
        <section aria-label="Назначенные мной — архив" style={{ display: 'grid', gap: 8 }}>
          {byMeAllDone.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>Пока нет завершённых задач, назначенных вами.</div>}

          {byMeAllDone.map((t) => {
            const urgent = (t.priority ?? 'normal') === 'high';
            const completedList = t.assignees.map((ass) => ass.completedAt).filter((d): d is Date => !!d);
            const lastCompletedAt = completedList.length ? completedList.sort((a: Date, b: Date) => b.getTime() - a.getTime())[0] : null;

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
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: '#374151' }}>
                    <span>Срок: {fmtRuDate(t.dueDate as Date)}</span>
                    <span>Завершено: {fmtRuDate(lastCompletedAt)}</span>
                  </div>
                </summary>

                <div style={{ padding: 10, borderTop: '1px solid #f3f4f6', display: 'grid', gap: 6 }}>
                  {t.description && <div style={{ whiteSpace: 'pre-wrap', color: '#111827', marginBottom: 8 }}>{t.description}</div>}
                  <div style={{ fontSize: 13 }}>
                    <div style={{ color: '#6b7280', marginBottom: 4 }}>Исполнители:</div>
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
                          {a.user?.name ?? `${a.user?.id?.slice(0, 8) ?? '—'}…`} {(a as any).status === 'done' ? '✓' : ''}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Единственная доступная операция — удалить задачу из базы (НЕ вложенная форма) */}
                  <div style={{ marginTop: 6 }}>
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
                          height: 32, padding: '0 12px', borderRadius: 10, border: '1px solid #e5e7eb',
                          background: '#fff', cursor: 'pointer', fontSize: 13, color: '#8d2828',
                        }}
                        title="Удалить задачу (нужны права)"
                      >
                        Удалить из базы
                      </button>
                    </form>
                  </div>
                </div>
              </details>
            );
          })}
        </section>
      )}
    </main>
  );
}

// app/(app)/inboxtasks/archive/page.tsx
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks } from '@/lib/roles';
import type { Prisma, TaskAssignee, Task } from '@prisma/client';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type TaskWithAssignees = Prisma.TaskGetPayload<{ include: { assignees: { include: { user: { select: { id: true; name: true } } } } } }>;

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
    TaskWithAssignees[]
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
      : Promise.resolve([] as TaskWithAssignees[]),
  ]);

  return (
    <main style={{ display: 'grid', gap: 12, padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Архив задач</h1>

        {mayCreate ? (
          <nav style={{ display: 'flex', gap: 8 }}>
            <a
              href="/inboxtasks/archive?tab=mine"
              className={`tab ${activeTab === 'mine' ? 'tab--active' : ''}`}
              aria-current={activeTab === 'mine' ? 'page' : undefined}
              style={{ textDecoration: 'none' }}
            >
              Назначенные мне ({mineAssigneesDone.length})
            </a>
            <a
              href="/inboxtasks/archive?tab=byme"
              className={`tab ${activeTab === 'byme' ? 'tab--active' : ''}`}
              aria-current={activeTab === 'byme' ? 'page' : undefined}
              style={{ textDecoration: 'none' }}
            >
              Назначенные мной ({byMeAllDone.length})
            </a>
          </nav>
        ) : (
          <div style={{ fontSize: 13, color: '#6b7280' }}>Роль: преподаватель — доступен только раздел «Назначенные мне»</div>
        )}
      </header>

      {/* Назначенные мне — архив */}
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
                    {urgent && <span style={{ fontSize: 11, color: '#8d2828', border: '1px solid #8d2828', borderRadius: 999, padding: '0 6px' }}>Срочно</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: '#374151' }}>
                    <span>Срок: {fmtRuDate(t?.dueDate as Date | undefined)}</span>
                    <span>Выполнено: {fmtRuDate(a.completedAt as Date | undefined)}</span>
                  </div>
                </summary>
                <div style={{ padding: 10, borderTop: '1px solid #f3f4f6' }}>
                  {t?.description && <div className="descBox">{t.description}</div>}
                  <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                    <span>Назначил: {t?.createdByName ?? '—'}</span>
                    {/* Разархивировать: вернёт назначение в "в работе" */}
                    <form action="/inboxtasks/actions">
                      {/* оставляем как есть у вас: вы уже подключили unarchive на стороне actions */}
                    </form>
                  </div>
                </div>
              </details>
            );
          })}
        </section>
      )}

      {/* Назначенные мной — архив */}
      {activeTab === 'byme' && mayCreate && (
        <section aria-label="Назначенные мной — архив" style={{ display: 'grid', gap: 8 }}>
          {byMeAllDone.length === 0 && <div style={{ color: '#6b7280', fontSize: 14 }}>Пока нет завершённых задач, назначенных вами.</div>}

          {byMeAllDone.map((t) => {
            const urgent = (t.priority ?? 'normal') === 'high';

            const completedList = t.assignees
              .map((ass) => ass.completedAt)
              .filter((d): d is Date => !!d);

            const lastCompletedAt =
              completedList.length
                ? completedList.sort((a: Date, b: Date) => b.getTime() - a.getTime())[0]
                : null;

            return (
              <details key={t.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
                <summary style={{ padding: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{t.title}</span>
                    {urgent && <span style={{ fontSize: 11, color: '#8d2828', border: '1px solid #8d2828', borderRadius: 999, padding: '0 6px' }}>Срочно</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: '#374151' }}>
                    <span>Срок: {fmtRuDate(t.dueDate as Date)}</span>
                    <span>Завершено: {fmtRuDate(lastCompletedAt)}</span>
                  </div>
                </summary>
                <div style={{ padding: 10, borderTop: '1px solid #f3f4f6', display: 'grid', gap: 6 }}>
                  {t.description && <div className="descBox">{t.description}</div>}
                  <div style={{ fontSize: 13 }}>
                    <div style={{ color: '#6b7280', marginBottom: 4 }}>Исполнители:</div>
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
                          {(a.user?.name ?? `${a.userId.slice(0, 8)}…`)} {a.status === 'done' ? '✓' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </section>
      )}

      <style>{`
        .tab {
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #111827;
          font-size: 13px;
        }
        .tab--active,
        .tab--active:link,
        .tab--active:visited,
        .tab--active:hover,
        .tab--active:focus {
          background: #8d2828;
          color: #fff !important;
          border-color: #8d2828;
        }
        .descBox {
          white-space: pre-wrap;
          word-break: break-word;
          overflow-wrap: anywhere;
          max-width: 100%;
          color: #111827;
          margin-bottom: 8px;
        }
      `}</style>
    </main>
  );
}

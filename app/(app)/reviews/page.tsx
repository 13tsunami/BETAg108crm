// app/(app)/reviews/page.tsx
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks } from '@/lib/roles';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import {
  approveSubmissionAction,
  rejectSubmissionAction,
  approveAllInTaskAction,
} from '../inboxtasks/review-actions';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type TaskWithAssignees = Prisma.TaskGetPayload<{
  include: {
    assignees: {
      include: {
        user: { select: { id: true; name: true } };
      };
    };
  };
}>;

function fmtRuDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  const f = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(dt);
  return f.replace('.', '');
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  await searchParams;

  const session = await auth();
  const meId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);
  const mayReview = canCreateTasks(role);

  if (!meId || !mayReview) redirect('/inboxtasks');

  const reviewFlowOn = process.env.NEXT_PUBLIC_REVIEW_FLOW === '1';

  const tasks: TaskWithAssignees[] = await prisma.task.findMany({
    where: {
      createdById: meId,
      ...(reviewFlowOn ? { reviewRequired: true } : {}),
      assignees: { some: { status: 'submitted' } },
    },
    include: {
      assignees: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  });

  return (
    <main style={{ padding: 16 }}>
      <header style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Проверка назначенных задач</h1>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          Здесь собраны ваши задачи c включённой проверкой, где есть сдачи на ревью.
        </div>
      </header>

      {tasks.length === 0 && (
        <div style={{ fontSize: 14, color: '#6b7280' }}>
          Пока нет задач, ожидающих проверки.
        </div>
      )}

      <section style={{ display: 'grid', gap: 10 }}>
        {tasks.map((t) => {
          const onReview = t.assignees.filter(a => a.status === 'submitted');
          const accepted = t.assignees.filter(a => a.status === 'done');

          return (
            <details key={t.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
              <summary style={{ padding: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: '#374151' }}>
                    Срок: {fmtRuDate(t.dueDate as Date)} • Принято {accepted.length} из {t.assignees.length}
                  </div>
                </div>
              </summary>

              <div style={{ padding: 10, borderTop: '1px solid #f3f4f6', display: 'grid', gap: 12 }}>
                {/* Верхняя панель действий по задаче */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <form action={approveAllInTaskAction}>
                    <input type="hidden" name="taskId" value={t.id} />
                    <button
                      type="submit"
                      title="Принять всех со статусом «на проверке»"
                      style={{ height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid #111827', background: '#111827', color: '#fff', cursor: 'pointer', fontSize: 13 }}
                    >
                      Принять всех
                    </button>
                  </form>
                </div>

                {t.description && (
                  <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                    {t.description}
                  </div>
                )}

                {/* На проверке */}
                <div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>На проверке</div>
                  {onReview.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#9ca3af' }}>Пока никого.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {onReview.map((a) => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <a
                            href={`/reviews/${a.id}`}
                            style={{ border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 8px', fontSize: 12, background: '#fff', textDecoration: 'none', color: '#111827' }}
                            title="Открыть карточку исполнения"
                          >
                            {a.user?.name ?? a.userId}
                          </a>

                          {/* Принять одного */}
                          <form action={approveSubmissionAction}>
                            <input type="hidden" name="taskAssigneeId" value={a.id} />
                            <button
                              type="submit"
                              style={{ height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid #111827', background: '#111827', color: '#fff', cursor: 'pointer', fontSize: 13 }}
                            >
                              Принять
                            </button>
                          </form>

                          {/* Вернуть с причиной */}
                          <form action={rejectSubmissionAction} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input type="hidden" name="taskAssigneeId" value={a.id} />
                            <input
                              name="reason"
                              placeholder="Причина (опц.)"
                              style={{ height: 28, padding: '0 8px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}
                            />
                            <button
                              type="submit"
                              style={{ height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', cursor: 'pointer', fontSize: 13 }}
                            >
                              Вернуть
                            </button>
                          </form>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Принято */}
                <div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Принято</div>
                  {accepted.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#9ca3af' }}>Пока никого.</div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {accepted.map((a) => (
                        <span key={a.id} title="Принято" style={{ border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 8px', fontSize: 12, background: '#ecfdf5' }}>
                          {a.user?.name ?? a.userId} ✓
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </details>
          );
        })}
      </section>
    </main>
  );
}

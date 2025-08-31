import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks } from '@/lib/roles';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import {
  approveSubmissionAction,
  rejectSubmissionAction,
} from '../inboxtasks/review-actions';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type TaskWithAssignees = Prisma.TaskGetPayload<{
  include: { assignees: { include: { user: { select: { id: true; name: true } } } } }
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

export default async function Page({
  searchParams,
}: { searchParams: SearchParams }) {
  const session = await auth();
  const meId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);
  const mayReview = canCreateTasks(role);

  if (!meId || !mayReview) {
    redirect('/inboxtasks');
  }

  // До миграций фильтруем по служебному маркеру [review] в title/description
  const tasks: TaskWithAssignees[] = await prisma.task.findMany({
    where: {
      createdById: meId,
      OR: [
        { title:       { contains: '[review]', mode: 'insensitive' } },
        { description: { contains: '[review]', mode: 'insensitive' } },
        { title:       { contains: '[проверка]', mode: 'insensitive' } },
        { description: { contains: '[проверка]', mode: 'insensitive' } },
      ],
    },
    include: {
      assignees: { include: { user: { select: { id: true, name: true } } } },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  });

  return (
    <main style={{ padding: 16 }}>
      <header style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Проверка назначенных задач</h1>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          Здесь отображаются только ваши задачи с пометкой [review]. Действия — макетные, база не изменяется.
        </div>
      </header>

      {tasks.length === 0 && (
        <div style={{ fontSize: 14, color: '#6b7280' }}>
          Задач, требующих проверки, не найдено.
        </div>
      )}

      <section style={{ display: 'grid', gap: 10 }}>
        {tasks.map((t) => {
          // До миграций считаем: исполнители со статусом in_progress — «на проверке», done — «принято».
          const onReview = t.assignees.filter(a => a.status === 'in_progress');
          const accepted = t.assignees.filter(a => a.status === 'done');

          return (
            <details key={t.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
              <summary style={{ padding: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: '#374151' }}>
                    Срок: {fmtRuDate(t.dueDate as Date)} • Принято {accepted.length} из {t.assignees.length}
                  </div>
                </div>
              </summary>

              <div style={{ padding: 10, borderTop: '1px solid #f3f4f6', display: 'grid', gap: 12 }}>
                {t.description && (
                  <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                    {t.description}
                  </div>
                )}

                <div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>На проверке</div>
                  {onReview.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#9ca3af' }}>Пока никого.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {onReview.map((a) => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 8px', fontSize: 12, background: '#fff' }}>
                            {a.user?.name ?? a.userId}
                          </span>

                          <form action={approveSubmissionAction}>
                            <input type="hidden" name="taskId" value={t.id} />
                            <input type="hidden" name="userId" value={a.userId} />
                            <button type="submit" className="btnPrimary" title="Принять (макет)"
                              style={{ height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid #111827', background: '#111827', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
                              Принять
                            </button>
                          </form>

                          <form action={rejectSubmissionAction} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input type="hidden" name="taskId" value={t.id} />
                            <input type="hidden" name="userId" value={a.userId} />
                            <input
                              name="comment"
                              placeholder="Комментарий (опц.)"
                              style={{ height: 28, padding: '0 8px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}
                            />
                            <button type="submit" className="btnGhost" title="Вернуть (макет)"
                              style={{ height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', cursor: 'pointer', fontSize: 13 }}>
                              Вернуть
                            </button>
                          </form>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

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

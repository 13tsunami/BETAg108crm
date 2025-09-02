// app/(app)/reviews/[taskAssigneeId]/page.tsx
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks } from '@/lib/roles';
import { redirect } from 'next/navigation';
import {
  approveSubmissionAction,
  rejectSubmissionAction,
} from '../../inboxtasks/review-actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmtRuDate(d?: Date | string | null): string {
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
function fmtRuDateTime(d?: Date | string | null): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  const date = fmtRuDate(dt);
  const time = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt);
  return `${date}, ${time}`;
}
function fmtBytes(n?: number | null): string {
  if (!n || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

type Params = Promise<{ taskAssigneeId: string }>;

export default async function Page({ params }: { params: Params }) {
  const { taskAssigneeId } = await params;

  const session = await auth();
  const meId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);
  const mayReview = canCreateTasks(role);
  if (!meId || !mayReview) redirect('/inboxtasks');

  const assn = await prisma.taskAssignee.findUnique({
    where: { id: taskAssigneeId },
    include: {
      user: { select: { name: true } },
      task: { select: { title: true, description: true, dueDate: true, priority: true, createdById: true, createdByName: true, reviewRequired: true } },
      submissions: {
        orderBy: [{ open: 'desc' as const }, { createdAt: 'desc' as const }],
        include: {
          attachments: {
            include: {
              attachment: {
                select: { originalName: true, name: true, size: true, mime: true, createdAt: true }
              }
            }
          }
        }
      }
    }
  });

  if (!assn || assn.task.createdById !== meId) redirect('/reviews');

  const openSubmission = assn.submissions.find(s => s.open);
  const closedSubmissions = assn.submissions.filter(s => !s.open);

  const statusLabel =
    assn.status === 'in_progress' ? 'в работе' :
    assn.status === 'submitted'   ? 'на проверке' :
    assn.status === 'done'        ? 'принято' :
    assn.status === 'rejected'    ? 'возвращено' : assn.status;

  return (
    <main style={{ padding: 16 }}>
      <a href="/reviews" className="linkBack" style={{ textDecoration: 'none', fontSize: 13 }}>&larr; Назад к списку</a>

      <header style={{ marginTop: 6, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{assn.task.title}</h1>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          Срок: {fmtRuDate(assn.task.dueDate)} • Приоритет: {(assn.task.priority ?? 'обычный') === 'high' ? 'высокий' : 'обычный'}
          {assn.task.reviewRequired ? ' • Требует проверки' : null}
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Исполнитель: {assn.user?.name ?? assn.userId} • Статус: {statusLabel}
        </div>
      </header>

      {assn.task.description && (
        <section className="card" style={{ marginBottom: 12 }}>
          <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            {assn.task.description}
          </div>
        </section>
      )}

      {/* Открытая сдача */}
      <section className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Текущая сдача</h2>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {openSubmission ? `Создано: ${fmtRuDateTime(openSubmission.createdAt)}` : 'Нет открытой сдачи'}
          </div>
        </div>

        {openSubmission ? (
          <>
            {/* Вложения открытой сдачи */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Вложения</div>
              {openSubmission.attachments.length === 0 ? (
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Файлы не прикреплены.</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {openSubmission.attachments.map((sa) => {
                    const a = sa.attachment;
                    return (
                      <li key={a.name} style={{ marginBottom: 4 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <a
                            href={`/api/files/${encodeURIComponent(a.name)}`}
                            style={{ fontWeight: 500, color: '#8d2828', textDecoration: 'underline' }}
                          >
                            {a.originalName ?? a.name}
                          </a>
                          <span style={{ fontSize: 12, color: '#6b7280' }}>
                            {a.mime} • {fmtBytes(a.size)} • загружено {fmtRuDateTime(a.createdAt)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Форма проверки: Принять / Вернуть с причиной */}
            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <form action={approveSubmissionAction}>
                <input type="hidden" name="taskAssigneeId" value={taskAssigneeId} />
                <button type="submit" className="btnPrimary">Принять</button>
              </form>

              <form action={rejectSubmissionAction} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="hidden" name="taskAssigneeId" value={taskAssigneeId} />
                <input
                  name="reason"
                  placeholder="Причина (опц.)"
                  style={{ height: 32, padding: '0 8px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}
                />
                <button type="submit" className="btnGhost">Вернуть</button>
              </form>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14, color: '#6b7280', marginTop: 6 }}>
            Открытой сдачи нет. Ожидаем отправку на проверку.
          </div>
        )}
      </section>

      {/* История сдач */}
      <section className="card">
        <h2 style={{ margin: 0, fontSize: 18, marginBottom: 6 }}>История сдач</h2>
        {closedSubmissions.length === 0 ? (
          <div style={{ fontSize: 14, color: '#6b7280' }}>Пока пусто.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {closedSubmissions.map((s) => (
              <div key={`${String(s.createdAt)}-${String(s.reviewedAt)}`} style={{ borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  Создано: {fmtRuDateTime(s.createdAt)} • Проверено: {fmtRuDateTime(s.reviewedAt)}
                </div>
                {s.reviewerComment && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>Комментарий проверяющего</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{s.reviewerComment}</div>
                  </div>
                )}

                {/* Вложения закрытой сдачи */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Вложения</div>
                  {s.attachments.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#9ca3af' }}>Файлы не прикреплены.</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {s.attachments.map((sa) => {
                        const a = sa.attachment;
                        return (
                          <li key={`${a.name}-${String(a.createdAt)}`} style={{ marginBottom: 4 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                              <a
                                href={`/api/files/${encodeURIComponent(a.name)}`}
                                style={{ fontWeight: 500, color: '#8d2828', textDecoration: 'underline' }}
                              >
                                {a.originalName ?? a.name}
                              </a>
                              <span style={{ fontSize: 12, color: '#6b7280' }}>
                                {a.mime} • {fmtBytes(a.size)} • загружено {fmtRuDateTime(a.createdAt)}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <style>{`
        .card { border:1px solid #e5e7eb; border-radius:12px; padding:12px; background:#fff; }
        .btnPrimary {
          height:32px; padding:0 12px; border-radius:10px; border:1px solid #111827; background:#111827; color:#fff; cursor:pointer; font-size:13px;
        }
        .btnGhost {
          height:32px; padding:0 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; color:#111827; cursor:pointer; font-size:13px;
        }
        .linkBack { color:#111827; }
      `}</style>
    </main>
  );
}

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
      task: {
        select: {
          title: true,
          description: true,
          dueDate: true,
          priority: true,
          createdById: true,
          createdByName: true,
          reviewRequired: true,
          attachments: {
            select: {
              attachment: {
                select: { id: true, name: true, originalName: true, size: true, mime: true, createdAt: true },
              },
            },
          },
        },
      },
      submissions: {
        orderBy: [{ open: 'desc' as const }, { createdAt: 'desc' as const }],
        include: {
          attachments: {
            include: {
              attachment: {
                select: { originalName: true, name: true, size: true, mime: true, createdAt: true },
              },
            },
          },
        },
      },
    },
  });

  if (!assn || assn.task.createdById !== meId) redirect('/reviews');

  const openSubmission = assn.submissions.find((s) => s.open);
  const closedSubmissions = assn.submissions.filter((s) => !s.open);

  const statusLabel =
    assn.status === 'in_progress' ? 'в работе'
      : assn.status === 'submitted' ? 'на проверке'
      : assn.status === 'done' ? 'принято'
      : assn.status === 'rejected' ? 'возвращено'
      : assn.status;

  const validOpenFiles = openSubmission
    ? openSubmission.attachments.filter((sa) => {
        const a = sa.attachment;
        return !!a && typeof a.size === 'number' && a.size > 0;
      })
    : [];

  return (
    <main className="reviews" style={{ padding: 16 }}>
      <a href="/reviews" className="linkBack" style={{ textDecoration: 'none', fontSize: 13 }}>
        &larr; Назад к списку
      </a>

      {/* Заголовок и базовые метки */}
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

      {/* Участники: назначил, исполнитель, проверяющий */}
      <section className="cardSoft">
        <h2 className="brandH">Участники</h2>
        <div className="actors">
          <span className="pill">
            <span className="muted">Назначил:</span>
            <b className="brandText">{assn.task.createdByName ?? assn.task.createdById}</b>
          </span>
          <span className="pill">
            <span className="muted">Исполнитель:</span>
            <b>{assn.user?.name ?? assn.userId}</b>
            <span className={`chip chip-${assn.status}`}>{statusLabel}</span>
          </span>
          <span className="pill">
            <span className="muted">Проверяющий:</span>
            <b>вы</b>
          </span>
        </div>
      </section>

      {/* Описание задачи — стеклянная карточка со светло-серой рамкой */}
      {assn.task.description && (
        <section className="cardSoft">
          <h2 className="brandH">Описание задачи</h2>
          <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            {assn.task.description}
          </div>
        </section>
      )}

      {/* Файлы задачи (исходные вложения) */}
      <section className="cardSoft">
        <h2 className="brandH">Файлы задачи</h2>
        {assn.task.attachments.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9ca3af' }}>Нет вложений.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {assn.task.attachments.map(({ attachment }) => {
              const a = attachment;
              const title = a.originalName || a.name;
              const size = fmtBytes(a.size);
              return (
                <li key={a.id} style={{ marginBottom: 4 }}>
                  <a
                    href={`/api/files/${encodeURIComponent(a.name)}`}
                    style={{ fontWeight: 500, color: '#8d2828', textDecoration: 'underline' }}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {title}
                  </a>
                  <span style={{ color: '#6b7280', marginLeft: 6, fontSize: 12 }}>
                    {a.mime} • {size} • загружено {fmtRuDateTime(a.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Текущая сдача — «тяжёлая» карточка с бордовой рамкой */}
      <section className="cardBrand">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <h2 className="brandH">Текущая сдача</h2>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {openSubmission ? `Создано: ${fmtRuDateTime(openSubmission.createdAt)}` : 'Нет открытой сдачи'}
          </div>
        </div>

        {openSubmission ? (
          <>
            {openSubmission.comment && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>Комментарий исполнителя</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{openSubmission.comment}</div>
              </div>
            )}

            <div style={{ marginTop: 8 }}>
              <div className="brandHSmall">Вложения</div>
              {validOpenFiles.length === 0 ? (
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Файлы не прикреплены.</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {validOpenFiles.map((sa) => {
                    const a = sa.attachment!;
                    const displayName =
                      a.originalName && a.originalName.toLowerCase() !== 'blob' ? a.originalName : a.name || 'без имени';
                    return (
                      <li key={a.name} style={{ marginBottom: 4 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <a
                            href={`/api/files/${encodeURIComponent(a.name)}`}
                            style={{ fontWeight: 500, color: '#8d2828', textDecoration: 'underline' }}
                          >
                            {displayName}
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

            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <form action={approveSubmissionAction}>
                <input type="hidden" name="taskAssigneeId" value={taskAssigneeId} />
                <button type="submit" className="btnBrand">Принять</button>
              </form>

              <form action={rejectSubmissionAction} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
                <input type="hidden" name="taskAssigneeId" value={taskAssigneeId} />
                <button type="submit" className="btnGhost">Вернуть на доработку</button>
                <input name="reason" placeholder="Комментарий (опц.)" className="revReason" />
              </form>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14, color: '#6b7280', marginTop: 6 }}>Открытой сдачи нет. Ожидаем отправку на проверку.</div>
        )}
      </section>

      {/* История сдач */}
      <section className="cardBrand">
        <h2 className="brandH">История сдач</h2>
        {closedSubmissions.length === 0 ? (
          <div style={{ fontSize: 14, color: '#6b7280' }}>Пока пусто.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {closedSubmissions.map((s) => {
              const validFiles = s.attachments.filter((sa) => {
                const a = sa.attachment;
                return !!a && typeof a.size === 'number' && a.size > 0;
              });

              return (
                <div key={`${String(s.createdAt)}-${String(s.reviewedAt)}`} style={{ borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    Создано: {fmtRuDateTime(s.createdAt)} • Проверено: {fmtRuDateTime(s.reviewedAt)}
                  </div>

                  {s.comment && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>Комментарий исполнителя</div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{s.comment}</div>
                    </div>
                  )}

                  {s.reviewerComment && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>Комментарий проверяющего</div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{s.reviewerComment}</div>
                    </div>
                  )}

                  <div style={{ marginTop: 8 }}>
                    <div className="brandHSmall">Вложения</div>
                    {validFiles.length === 0 ? (
                      <div style={{ fontSize: 13, color: '#9ca3af' }}>Файлы не прикреплены.</div>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {validFiles.map((sa) => {
                          const a = sa.attachment!;
                          const displayName =
                            a.originalName && a.originalName.toLowerCase() !== 'blob' ? a.originalName : a.name || 'без имени';
                          return (
                            <li key={`${a.name}-${String(a.createdAt)}`} style={{ marginBottom: 4 }}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                                <a
                                  href={`/api/files/${encodeURIComponent(a.name)}`}
                                  style={{ fontWeight: 500, color: '#8d2828', textDecoration: 'underline' }}
                                >
                                  {displayName}
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
              );
            })}
          </div>
        )}
      </section>

      <style>{`
        .reviews { --brand:#8d2828; }
        .brandText { color: var(--brand); }

        /* Тяжёлые бордовые карточки */
        .cardBrand {
          border: 2px solid var(--brand);
          border-radius: 12px;
          padding: 12px;
          background: #fff;
          margin-bottom: 12px;
        }

        /* Лёгкие стеклянные карточки (внутренние секции) */
        .cardSoft {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 12px;
          background: #fff;
          margin-bottom: 12px;
        }

        .brandH { margin: 0 0 6px 0; font-size: 18px; color: var(--brand); }
        .brandHSmall { font-size: 13px; color: var(--brand); margin-bottom: 6px; }

        .actors { display: flex; gap: 8px; flex-wrap: wrap; }
        .pill {
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          padding: 4px 10px;
          font-size: 13px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #fff;
        }
        .muted { color: #6b7280; }
        .chip {
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 12px;
          line-height: 1.4;
          color: #374151;
          background: #f9fafb;
        }
        .chip-done { background: #ecfdf5; border-color: #d1fae5; }
        .chip-submitted { background: #fffbeb; border-color: #fde68a; }
        .chip-rejected { background: #fef2f2; border-color: #fecaca; }

        .btnBrand {
          height: 32px;
          padding: 0 12px;
          border-radius: 10px;
          border: 1px solid var(--brand);
          background: var(--brand);
          color: #fff;
          cursor: pointer;
          font-size: 13px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .btnBrand:disabled { opacity: .6; cursor: not-allowed; }

        .btnGhost {
          height: 32px;
          padding: 0 12px;
          border-radius: 10px;
          border: 1px solid #e5e7eb;
          background: #d32121ff;
          color: #f7f8faff;
          cursor: pointer;
          font-size: 13px;
          white-space: nowrap;
        }

        .revReason { height: 32px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--brand); font-size: 13px; min-width: 200px; flex: 1; }

        .linkBack { color:#111827; }
      `}</style>
    </main>
  );
}

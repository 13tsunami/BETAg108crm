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
import { approveSelectedAction, rejectSelectedAction } from '@/app/(app)/reviews/bulk-actions';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type TaskForReview = Prisma.TaskGetPayload<{
  include: {
    assignees: {
      include: {
        user: { select: { id: true; name: true } };
        submissions: {
          where: { open: true };
          orderBy: { createdAt: 'desc' };
          take: 1;
          select: {
            createdAt: true;
            _count: { select: { attachments: true } };
          };
        };
      };
    };
    attachments: {
      select: {
        attachment: {
          select: { id: true; name: true; originalName: true; size: true; mime: true };
        };
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
function fmtTime(d?: Date | string | null): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt);
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

  const tasks: TaskForReview[] = await prisma.task.findMany({
    where: {
      createdById: meId,
      ...(reviewFlowOn ? { reviewRequired: true } : {}),
      assignees: { some: { status: 'submitted' } },
      hidden: { not: true },
    },
    include: {
      assignees: {
        include: {
          user: { select: { id: true, name: true } },
          submissions: {
            where: { open: true },
            orderBy: { createdAt: 'desc' as const },
            take: 1,
            select: { createdAt: true, _count: { select: { attachments: true } } },
          },
        },
      },
      attachments: {
        select: {
          attachment: {
            select: { id: true, name: true, originalName: true, size: true, mime: true },
          },
        },
      },
    },
    orderBy: [{ dueDate: 'asc' as const }, { createdAt: 'desc' as const }],
  });

  return (
    <main className="reviews" style={{ padding: 16 }}>
      <header style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Проверка назначенных задач</h1>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          Здесь собраны ваши задачи с включённой проверкой и имеющимися сдачами.
        </div>
      </header>

      {tasks.length === 0 && (
        <div style={{ fontSize: 14, color: '#6b7280' }}>Пока нет задач, ожидающих проверки.</div>
      )}

      <section style={{ display: 'grid', gap: 10 }}>
        {tasks.map((t) => {
          const onReviewAll = t.assignees.filter(a => a.status === 'submitted');
          const acceptedAll = t.assignees.filter(a => a.status === 'done');

          const lastActivity = onReviewAll
            .map(a => a.submissions[0]?.createdAt)
            .filter(Boolean)
            .sort((a, b) => +new Date(b as Date) - +new Date(a as Date))[0];

          return (
            <details key={t.id} className="revCard">
              <summary className="revHeader">
                <div>
                  <div className="revTitle">{t.title}</div>
                  <div className="revMeta">
                    Срок: {fmtRuDate(t.dueDate as Date)} • На проверке {onReviewAll.length} • Принято {acceptedAll.length} из {t.assignees.length}
                  </div>
                  <div className="revMeta">
                    Назначил: <span className="brandText">{t.createdByName ?? t.createdById}</span>
                    {lastActivity ? ` • последняя активность: ${fmtTime(lastActivity as Date)}` : ''}
                    {' • '}Проверяющий: вы
                  </div>
                </div>
              </summary>

              <div className="revBody">
                {/* Файлы задачи */}
                <div>
                  <div className="revSectionTitle">Файлы задачи</div>
                  {t.attachments.length === 0 ? (
                    <div className="revEmpty">Нет вложений.</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {t.attachments.map(({ attachment }) => {
                        const title = attachment.originalName || attachment.name;
                        const sizeKb = Math.max(1, Math.round((attachment.size ?? 0) / 1024));
                        return (
                          <li key={attachment.id} style={{ marginBottom: 4 }}>
                            <a
                              href={`/api/files/${encodeURIComponent(attachment.name)}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontWeight: 500, color: '#8d2828', textDecoration: 'underline' }}
                            >
                              {title}
                            </a>
                            <span style={{ color: '#6b7280', marginLeft: 6, fontSize: 12 }}>
                              {attachment.mime} • ~{sizeKb} КБ
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* На проверке */}
                <div>
                  <div className="revSectionTitle">На проверке</div>
                  {onReviewAll.length === 0 ? (
                    <div className="revEmpty">Пока никого.</div>
                  ) : (
                    <form className="revBulkForm">
                      <div style={{ display: 'grid', gap: 8 }}>
                        {onReviewAll.map((a, idx) => {
                          const open = a.submissions[0];
                          const filesCount = open?._count.attachments ?? 0;
                          return (
                            <div key={a.id} className="revRow">
                              <input
                                type="checkbox"
                                name="taskAssigneeId"
                                value={a.id}
                                className="revChk"
                                title="Выбрать для массового действия"
                              />

                              <span className="revIdx">{idx + 1}.</span>

                              <a
                                href={`/reviews/${a.id}`}
                                className="revPill"
                                title="Открыть карточку исполнения"
                              >
                                {a.user?.name ?? a.userId}
                              </a>

                              <span className="revHint">
                                отправлено {open ? fmtTime(open.createdAt as Date) : '—'}
                                {` • 📎 ${filesCount}`}
                              </span>

                              {/* Быстрые действия */}
                              <form action={approveSubmissionAction}>
                                <input type="hidden" name="taskAssigneeId" value={a.id} />
                                <button type="submit" className="btnBrand">Принять</button>
                              </form>

                              <details className="revInlineReject">
                                <summary className="btnGhost" role="button">Вернуть</summary>
                                <form action={rejectSubmissionAction} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <input type="hidden" name="taskAssigneeId" value={a.id} />
                                  <input name="reason" placeholder="Комментарий (опц.)" className="revReason" />
                                  <button type="submit" className="btnGhost">Отправить</button>
                                </form>
                              </details>
                            </div>
                          );
                        })}
                      </div>

                      {/* Липкая панель массовых действий */}
                      <div className="bulkBar">
                        <div className="bulkLeft">Выбрано: <span className="bulkCount">—</span></div>
                        <div className="bulkRight">
                          <button type="submit" formAction={approveSelectedAction} className="btnBrand">Принять выбранных</button>
                          <input name="reason" className="revReason" placeholder="Комментарий (опц.)" />
                          <button type="submit" formAction={rejectSelectedAction} className="btnGhost">Вернуть выбранных</button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>

                {/* Массовые действия для всей задачи */}
                <details>
                  <summary className="revShowAll">Массовые действия</summary>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                    <form action={approveAllInTaskAction} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="hidden" name="taskId" value={t.id} />
                      <span className="revHint">Исполнители со статусом «на проверке» будут приняты.</span>
                      <button type="submit" className="btnBrand">Принять всех</button>
                    </form>
                  </div>
                </details>

                {/* Принято */}
                <div>
                  <div className="revSectionTitle">Принято</div>
                  {acceptedAll.length === 0 ? (
                    <div className="revEmpty">Пока никого.</div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {acceptedAll.map((a) => (
                        <span key={a.id} title="Принято" className="revAccepted">
                          {a.user?.name ?? a.userId} ✓
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <style>{`
                .reviews { --brand:#8d2828; }
                .brandText { color: var(--brand); }

                .revCard {
                  border: 2px solid var(--brand);
                  border-radius: 12px;
                  background: #fff;
                  margin: 10px 0 12px;
                }
                .revHeader {
                  padding: 10px;
                  cursor: pointer;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  gap: 12px;
                }
                .revTitle { font-weight: 600; }
                .revMeta  { font-size: 12px; color: #374151; }

                .revBody {
                  padding: 10px;
                  border-top: 1px solid #f3f4f6;
                  display: grid;
                  gap: 12px;
                }

                .revSectionTitle { font-size: 13px; color: var(--brand); margin-bottom: 6px; }
                .revEmpty { font-size: 13px; color: #9ca3af; }
                .revRow { display: grid; grid-template-columns: 20px 28px auto 1fr auto auto; align-items: center; gap: 8px; width: 100%; }
                .revIdx { font-size: 12px; color: #6b7280; text-align: right; }
                .revChk { width: 16px; height: 16px; }
                .revHint { font-size: 12px; color: #6b7280; }

                .revPill {
                  border: 1px solid var(--brand);
                  border-radius: 999px;
                  padding: 2px 10px;
                  font-size: 12px;
                  background: #fff;
                  text-decoration: none;
                  color: #111827;
                  justify-self: start;
                }

                .revInlineReject > summary { list-style: none; }
                .revInlineReject[open] > summary { opacity: .8; }

                .bulkBar {
                  position: sticky;
                  bottom: 8px;
                  margin-top: 10px;
                  border: 1px solid #e5e7eb;
                  border-radius: 10px;
                  background: #fff;
                  padding: 8px;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  gap: 8px;
                }
                .bulkRight { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
                .bulkCount { font-weight: 600; }

                .revShowAll { cursor: pointer; font-size: 13px; color: var(--brand); }

                .btnBrand {
                  height: 28px;
                  padding: 0 10px;
                  border-radius: 8px;
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
                  height: 28px;
                  padding: 0 10px;
                  border-radius: 8px;
                  border: 1px solid #e5e7eb;
                  background: #fff;
                  color: #111827;
                  cursor: pointer;
                  font-size: 13px;
                  white-space: nowrap;
                }

                .revReason { height: 28px; padding: 0 8px; border-radius: 8px; border: 1px solid #e5e7eb; font-size: 13px; min-width: 180px; }

                .revAccepted {
                  border: 1px solid #e5e7eb;
                  border-radius: 999px;
                  padding: 2px 8px;
                  font-size: 12px;
                  background: #ecfdf5;
                }

                @media (max-width: 720px) {
                  .revRow { grid-template-columns: 20px 28px 1fr; grid-auto-rows: auto; }
                  .revHint { grid-column: 3 / span 1; }
                }
              `}</style>
            </details>
          );
        })}
      </section>
    </main>
  );
}

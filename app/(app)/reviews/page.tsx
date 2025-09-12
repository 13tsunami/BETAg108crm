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
} from '@/app/(app)/inboxtasks/review-actions';
import { bulkReviewAction } from '@/app/(app)/reviews/bulk-actions';

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
  await searchParams; // контракт Next 15

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
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              createdAt: true,
              _count: { select: { attachments: true } },
            },
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
          const onReviewAll = t.assignees.filter((a) => a.status === 'submitted');
          const acceptedAll = t.assignees.filter((a) => a.status === 'done');
          const onReviewFirst = onReviewAll.slice(0, 5);
          const onReviewRest = onReviewAll.slice(5);
          const acceptedFirst = acceptedAll.slice(0, 5);
          const acceptedRest = acceptedAll.slice(5);

          const lastActivity = onReviewAll
            .map((a) => a.submissions[0]?.createdAt)
            .filter(Boolean)
            .sort((a, b) => +new Date(b as Date) - +new Date(a as Date))[0];

          const bulkFormId = `bulk-${t.id}`;

          return (
            <details key={t.id} className="revCard">
              <summary className="revHeader">
                <div>
                  <div className="revTitle">{t.title}</div>
                  <div className="revMeta">
                    Срок: {fmtRuDate(t.dueDate as Date)} • Принято {acceptedAll.length} из {t.assignees.length}
                    {t.attachments.length ? ` • 📎 ${t.attachments.length}` : ''}
                  </div>
                  <div className="revMeta">
                    Назначил: <span className="brand">{t.createdByName ?? t.createdById}</span>
                    {' • '}Проверяющий: вы
                    {lastActivity ? ` • последняя активность: ${fmtTime(lastActivity as Date)}` : ''}
                  </div>
                </div>
              </summary>

              <div className="revBody">
                <details>
                  <summary className="revShowAll">Массовые действия</summary>
                  <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <form action={approveAllInTaskAction}>
                      <input type="hidden" name="taskId" value={t.id} />
                      <button type="submit" title="Принять всех со статусом «на проверке»" className="btnBrand">
                        Принять всех
                      </button>
                    </form>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>
                      Отмечайте галочками исполнителей ниже. Внизу карточки — панель «Принять выбранных / Вернуть выбранных».
                    </span>
                  </div>
                </details>

                {t.description && (
                  <div className="revTaskDesc">
                    {t.description}
                  </div>
                )}

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

                <div>
                  <div className="revSectionTitle">На проверке</div>
                  {onReviewAll.length === 0 ? (
                    <div className="revEmpty">Пока никого.</div>
                  ) : (
                    <>
                      {/* bulk-форма отдельно; чекбоксы будут связаны с ней через form="<id>" */}
                      <form id={bulkFormId} action={bulkReviewAction} className="bulkForm">
                        <input type="hidden" name="taskId" value={t.id} />
                        {/* Липкая панель массовых действий */}
                        <div className="bulkBar">
                          <div className="brandHSmall">Массовые действия</div>
                          <div className="bulkControls">
                            <button type="submit" name="__op" value="approve" className="btnBrand">Принять выбранных</button>
                            <button type="submit" name="__op" value="reject" className="btnGhost">Вернуть выбранных</button>
                            <input name="reason" placeholder="Комментарий (опц.)" className="revReason" />
                          </div>
                          <div className="bulkHint">Галочки в строках выше попадут в эту операцию.</div>
                        </div>
                      </form>

                      {/* Список строк: чекбокс связан с bulk-формой, быстрые действия — отдельные мини-формы */}
                      <div style={{ display: 'grid', gap: 8 }}>
                        {onReviewFirst.map((a, idx) => {
                          const os = a.submissions[0];
                          const filesCount = os?._count?.attachments ?? 0;
                          return (
                            <div key={a.id} className="revRow">
                              <input type="checkbox" form={bulkFormId} name="ids" value={a.id} className="revChk" />
                              <span className="revIdx">{idx + 1}.</span>

                              <a href={`/reviews/${a.id}`} className="revPill" title="Открыть карточку исполнения">
                                {a.user?.name ?? a.user?.id ?? a.id}
                              </a>

                              <span className="revWhen">
                                {os?.createdAt ? `отправлено ${fmtTime(os.createdAt)}` : 'без отметки времени'}
                                {filesCount ? ` • файлов: ${filesCount}` : ' • файлов: 0'}
                              </span>

                              {/* Быстрые одиночные действия — отдельные формы, не внутри bulk-формы */}
                              <form action={approveSubmissionAction}>
                                <input type="hidden" name="taskAssigneeId" value={a.id} />
                                <button type="submit" className="btnBrand">Принять</button>
                              </form>

                              <form action={rejectSubmissionAction} className="revRejectForm">
                                <input type="hidden" name="taskAssigneeId" value={a.id} />
                                <button type="submit" className="btnGhost">Вернуть</button>
                                <input name="reason" placeholder="Комментарий (опц.)" className="revReason" />
                              </form>
                            </div>
                          );
                        })}
                      </div>

                      {onReviewRest.length > 0 && (
                        <details style={{ marginTop: 6 }}>
                          <summary className="revShowAll">Показать всех исполнителей ({onReviewRest.length})</summary>
                          <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                            {onReviewRest.map((a, jdx) => {
                              const idx = 5 + jdx;
                              const os = a.submissions[0];
                              const filesCount = os?._count?.attachments ?? 0;
                              return (
                                <div key={a.id} className="revRow">
                                  <input type="checkbox" form={bulkFormId} name="ids" value={a.id} className="revChk" />
                                  <span className="revIdx">{idx + 1}.</span>

                                  <a href={`/reviews/${a.id}`} className="revPill" title="Открыть карточку исполнения">
                                    {a.user?.name ?? a.user?.id ?? a.id}
                                  </a>

                                  <span className="revWhen">
                                    {os?.createdAt ? `отправлено ${fmtTime(os.createdAt)}` : 'без отметки времени'}
                                    {filesCount ? ` • файлов: ${filesCount}` : ' • файлов: 0'}
                                  </span>

                                  <form action={approveSubmissionAction}>
                                    <input type="hidden" name="taskAssigneeId" value={a.id} />
                                    <button type="submit" className="btnBrand">Принять</button>
                                  </form>

                                  <form action={rejectSubmissionAction} className="revRejectForm">
                                    <input type="hidden" name="taskAssigneeId" value={a.id} />
                                    <button type="submit" className="btnGhost">Вернуть</button>
                                    <input name="reason" placeholder="Комментарий (опц.)" className="revReason" />
                                  </form>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <div className="revSectionTitle">Принято</div>
                  {acceptedAll.length === 0 ? (
                    <div className="revEmpty">Пока никого.</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {acceptedFirst.map((a) => (
                          <span key={a.id} title="Принято" className="revAccepted">
                            {a.user?.name ?? a.user?.id ?? a.id} ✓
                          </span>
                        ))}
                      </div>
                      {acceptedRest.length > 0 && (
                        <details style={{ marginTop: 6 }}>
                          <summary className="revShowAll">Показать всех ({acceptedRest.length})</summary>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                            {acceptedRest.map((a) => (
                              <span key={a.id} title="Принято" className="revAccepted">
                                {a.user?.name ?? a.user?.id ?? a.id} ✓
                              </span>
                            ))}
                          </div>
                        </details>
                      )}
                    </>
                  )}
                </div>
              </div>
            </details>
          );
        })}
      </section>

      <style>{`
        .reviews { --brand:#8d2828; }

        .revCard { border: 2px solid var(--brand); border-radius: 12px; background: #fff; margin: 10px 0 12px; }
        .revHeader { padding: 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .revTitle { font-weight: 600; }
        .revMeta  { font-size: 12px; color: #374151; }

        .revBody { padding: 10px; border-top: 1px solid #f3f4f6; display: grid; gap: 12px; }

        .revTaskDesc { border:1px solid #e5e7eb; border-radius:12px; padding:8px; white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word; }

        .revSectionTitle { font-size: 13px; color: var(--brand); margin-bottom: 6px; }
        .revEmpty { font-size: 13px; color: #9ca3af; }

        .revRow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; width: 100%; }
        .revIdx { font-size: 12px; color: #6b7280; min-width: 24px; text-align: right; }
        .revChk { width: 16px; height: 16px; }
        .revWhen { font-size: 12px; color: #6b7280; }

        .revPill {
          border: 1px solid var(--brand);
          border-radius: 999px;
          padding: 2px 10px;
          font-size: 12px;
          background: #fff;
          text-decoration: none;
          color: #111827;
        }

        .revRejectForm { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .revReason { height: 28px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--brand); font-size: 13px; min-width: 180px; }

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

        .revAccepted {
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 12px;
          background: #ecfdf5;
        }

        /* Липкая панель массовых действий */
        .bulkForm { position: relative; }
        .bulkBar {
          position: sticky;
          bottom: 0;
          background: linear-gradient(#fff 60%, rgba(255,255,255,0.9));
          border-top: 1px solid #f3f4f6;
          padding-top: 8px;
          margin-top: 8px;
        }
        .brandHSmall { font-size: 13px; color: var(--brand); margin-bottom: 6px; }
        .bulkControls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .bulkHint { font-size: 12px; color:#6b7280; margin-top: 4px; }
      `}</style>
    </main>
  );
}

// app/(app)/reviews/page.tsx
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks } from '@/lib/roles';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { bulkReviewAction } from '@/app/(app)/reviews/bulk-actions';
import s from './reviews.module.css';

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
    <main className={s.reviews}>
      <header className={s.pageHead}>
        <h1 className={s.pageTitle}>Проверка назначенных задач</h1>
        <div className={s.pageSubtitle}>
          Здесь собраны ваши задачи с включённой проверкой и имеющимися сдачами.
        </div>
      </header>

      {tasks.length === 0 && <div className={s.emptyPage}>Пока нет задач, ожидающих проверки.</div>}

      <section className={s.grid}>
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
            <details key={t.id} className={s.revCard}>
              <summary className={s.revHeader}>
                <div>
                  <div className={s.revTitle}>{t.title}</div>
                  <div className={s.revMeta}>
                    Срок: {fmtRuDate(t.dueDate as Date)} • Принято {acceptedAll.length} из {t.assignees.length}
                    {t.attachments.length ? ` • 📎 ${t.attachments.length}` : ''}
                  </div>
                  <div className={s.revMeta}>
                    Назначил: <span className={s.brand}>{t.createdByName ?? t.createdById}</span>
                    {' • '}Проверяющий: вы
                    {lastActivity ? ` • последняя активность: ${fmtTime(lastActivity as Date)}` : ''}
                  </div>
                </div>
              </summary>

              <div className={s.revBody}>
                {t.description && <div className={s.revTaskDesc}>{t.description}</div>}

                <div>
                  <div className={s.revSectionTitle}>Файлы задачи</div>
                  {t.attachments.length === 0 ? (
                    <div className={s.revEmpty}>Нет вложений.</div>
                  ) : (
                    <ul className={s.filesList}>
                      {t.attachments.map(({ attachment }) => {
                        const title = attachment.originalName || attachment.name;
                        const sizeKb = Math.max(1, Math.round((attachment.size ?? 0) / 1024));
                        return (
                          <li key={attachment.id} className={s.fileItem}>
                            <a
                              href={`/api/files/${encodeURIComponent(attachment.name)}`}
                              target="_blank"
                              rel="noreferrer"
                              className={s.fileLink}
                              title={title}
                            >
                              {title}
                            </a>
                            <span className={s.fileMeta}>
                              {attachment.mime} • ~{sizeKb} КБ
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div>
                  <div className={s.revSectionTitle}>На проверке</div>
                  {onReviewAll.length === 0 ? (
                    <div className={s.revEmpty}>Пока никого.</div>
                  ) : (
                    <>
                      {/* ЕДИНСТВЕННЫЕ массовые действия: чекбоксы + нижняя панель */}
                      <form id={bulkFormId} action={bulkReviewAction} className={s.bulkForm}>
                        <input type="hidden" name="taskId" value={t.id} />
                        <div className={s.bulkBar}>
                          <div className={s.brandHSmall}>Массовые действия</div>
                          <div className={s.bulkControls}>
                            <button type="submit" name="__op" value="approve" className={s.btnBrand}>
                              Принять выбранных
                            </button>
                            <button type="submit" name="__op" value="reject" className={s.btnGhost}>
                              Вернуть выбранных
                            </button>
                            <input name="reason" placeholder="Комментарий (опц.)" className={s.revReason} />
                          </div>
                          <div className={s.bulkHint}>
                            Отметьте галочками исполнителей ниже и нажмите действие.
                          </div>
                        </div>
                      </form>

                      {/* Список строк: ТОЛЬКО чекбоксы + ссылка, без быстрых одиночных кнопок */}
                      <div className={s.rows}>
                        {onReviewFirst.map((a, idx) => {
                          const os = a.submissions[0];
                          const filesCount = os?._count?.attachments ?? 0;
                          return (
                            <div key={a.id} className={s.revRow}>
                              <input type="checkbox" form={bulkFormId} name="ids" value={a.id} className={s.revChk} />
                              <span className={s.revIdx}>{idx + 1}.</span>

                              <a href={`/reviews/${a.id}`} className={s.revPill} title="Открыть карточку исполнения">
                                {a.user?.name ?? a.user?.id ?? a.id}
                              </a>

                              <span className={s.revWhen}>
                                {os?.createdAt ? `отправлено ${fmtTime(os.createdAt)}` : 'без отметки времени'}
                                {filesCount ? ` • файлов: ${filesCount}` : ' • файлов: 0'}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {onReviewRest.length > 0 && (
                        <details className={s.moreBlock}>
                          <summary className={s.revShowAll}>
                            Показать всех исполнителей ({onReviewRest.length})
                          </summary>
                          <div className={s.rowsMore}>
                            {onReviewRest.map((a, jdx) => {
                              const idx = 5 + jdx;
                              const os = a.submissions[0];
                              const filesCount = os?._count?.attachments ?? 0;
                              return (
                                <div key={a.id} className={s.revRow}>
                                  <input type="checkbox" form={bulkFormId} name="ids" value={a.id} className={s.revChk} />
                                  <span className={s.revIdx}>{idx + 1}.</span>

                                  <a href={`/reviews/${a.id}`} className={s.revPill} title="Открыть карточку исполнения">
                                    {a.user?.name ?? a.user?.id ?? a.id}
                                  </a>

                                  <span className={s.revWhen}>
                                    {os?.createdAt ? `отправлено ${fmtTime(os.createdAt)}` : 'без отметки времени'}
                                    {filesCount ? ` • файлов: ${filesCount}` : ' • файлов: 0'}
                                  </span>
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
                  <div className={s.revSectionTitle}>Принято</div>
                  {acceptedAll.length === 0 ? (
                    <div className={s.revEmpty}>Пока никого.</div>
                  ) : (
                    <>
                      <div className={s.acceptedList}>
                        {acceptedFirst.map((a) => (
                          <span key={a.id} title="Принято" className={s.revAccepted}>
                            {a.user?.name ?? a.user?.id ?? a.id} ✓
                          </span>
                        ))}
                      </div>
                      {acceptedRest.length > 0 && (
                        <details className={s.moreBlock}>
                          <summary className={s.revShowAll}>Показать всех ({acceptedRest.length})</summary>
                          <div className={s.acceptedMore}>
                            {acceptedRest.map((a) => (
                              <span key={a.id} title="Принято" className={s.revAccepted}>
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
    </main>
  );
}

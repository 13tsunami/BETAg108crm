// app/(app)/reviews/[taskAssigneeId]/page.tsx
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks } from '@/lib/roles';
import { redirect } from 'next/navigation';
import {
  approveSubmissionAction,
  rejectSubmissionAction,
} from '../../inboxtasks/review-actions';
import s from './review-details.module.css';

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
  return `${fmtRuDate(dt)}, ${new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt)}`;
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
    <main className={s.wrap}>
      <a href="/reviews" className={s.linkBack}>&larr; Назад к списку</a>

      {/* Заголовок и мета */}
      <header className={s.head}>
        <h1 className={s.title}>{assn.task.title}</h1>
        <div className={s.metaRow}>
          Срок: {fmtRuDate(assn.task.dueDate)} • Приоритет:{' '}
          {(assn.task.priority ?? 'normal') === 'high' ? 'высокий' : 'обычный'}
          {assn.task.reviewRequired ? ' • Требует проверки' : null}
        </div>
        <div className={s.metaRow}>
          Исполнитель: {assn.user?.name ?? assn.userId} • Статус: {statusLabel}
        </div>
      </header>

      {/* Участники */}
      <section className={s.cardSoft}>
        <h2 className={s.brandH}>Участники</h2>
        <div className={s.actors}>
          <span className={s.pill}>
            <span className={s.muted}>Назначил:</span>
            <b className={s.brandText}>{assn.task.createdByName ?? assn.task.createdById}</b>
          </span>
          <span className={s.pill}>
            <span className={s.muted}>Исполнитель:</span>
            <b>{assn.user?.name ?? assn.userId}</b>
            <span className={`${s.chip} ${s['chip-' + assn.status]}`}>{statusLabel}</span>
          </span>
          <span className={s.pill}>
            <span className={s.muted}>Проверяющий:</span>
            <b>вы</b>
          </span>
        </div>
      </section>

      {/* Описание */}
      {assn.task.description && (
        <section className={s.cardSoft}>
          <h2 className={s.brandH}>Описание задачи</h2>
          <div className={s.prewrap}>{assn.task.description}</div>
        </section>
      )}

      {/* Файлы задачи */}
      <section className={s.cardSoft}>
        <h2 className={s.brandH}>Файлы задачи</h2>
        {assn.task.attachments.length === 0 ? (
          <div className={s.emptyText}>Нет вложений.</div>
        ) : (
          <ul className={s.fileList}>
            {assn.task.attachments.map(({ attachment: a }) => {
              const title = a.originalName || a.name;
              const size = fmtBytes(a.size);
              return (
                <li key={a.id} className={s.fileItem}>
                  <a
                    href={`/api/files/${encodeURIComponent(a.name)}`}
                    className={s.fileLink}
                    target="_blank"
                    rel="noreferrer"
                    title={title}
                  >
                    {title}
                  </a>
                  <span className={s.fileMeta}>
                    {a.mime} • {size} • загружено {fmtRuDateTime(a.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Текущая сдача */}
      <section className={s.cardBrand}>
        <div className={s.brandHeadRow}>
          <h2 className={s.brandH}>Текущая сдача</h2>
          <div className={s.metaSmall}>
            {openSubmission ? `Создано: ${fmtRuDateTime(openSubmission.createdAt)}` : 'Нет открытой сдачи'}
          </div>
        </div>

        {openSubmission ? (
          <>
            {openSubmission.comment && (
              <div className={s.block}>
                <div className={s.mutedSmall}>Комментарий исполнителя</div>
                <div className={s.prewrap}>{openSubmission.comment}</div>
              </div>
            )}

            <div className={s.block}>
              <div className={s.brandHSmall}>Вложения</div>
              {validOpenFiles.length === 0 ? (
                <div className={s.emptyText}>Файлы не прикреплены.</div>
              ) : (
                <ul className={s.fileList}>
                  {validOpenFiles.map((sa) => {
                    const a = sa.attachment!;
                    const displayName =
                      a.originalName && a.originalName.toLowerCase() !== 'blob'
                        ? a.originalName
                        : a.name || 'без имени';
                    return (
                      <li key={a.name} className={s.fileItem}>
                        <div className={s.fileRow}>
                          <a href={`/api/files/${encodeURIComponent(a.name)}`} className={s.fileLink}>
                            {displayName}
                          </a>
                          <span className={s.fileMeta}>
                            {a.mime} • {fmtBytes(a.size)} • загружено {fmtRuDateTime(a.createdAt)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className={s.actionsRow}>
              <form action={approveSubmissionAction}>
                <input type="hidden" name="taskAssigneeId" value={taskAssigneeId} />
                <button type="submit" className={s.btnBrand}>Принять</button>
              </form>

              <form action={rejectSubmissionAction} className={s.rejectForm}>
                <input type="hidden" name="taskAssigneeId" value={taskAssigneeId} />
                <button type="submit" className={s.btnGhost}>Вернуть на доработку</button>
                <input name="reason" placeholder="Комментарий (опц.)" className={s.revReason} />
              </form>
            </div>
          </>
        ) : (
          <div className={s.emptyTextLg}>Открытой сдачи нет. Ожидаем отправку на проверку.</div>
        )}
      </section>

     {/* История сдач */}
<section className={s.cardBrand}>
  <h2 className={s.brandH}>История сдач</h2>
  {closedSubmissions.length === 0 ? (
    <div className={s.emptyTextLg}>Пока пусто.</div>
  ) : (
    <div className={s.history}>
      {closedSubmissions.map((sub) => {
        const validFiles = sub.attachments.filter((sa) => {
          const a = sa.attachment;
          return !!a && typeof a.size === 'number' && a.size > 0;
        });

        return (
          <div key={`${String(sub.createdAt)}-${String(sub.reviewedAt)}`} className={s.historyItem}>
            <div className={s.metaSmall}>
              Создано: {fmtRuDateTime(sub.createdAt)} • Проверено: {fmtRuDateTime(sub.reviewedAt)}
            </div>

            {sub.comment && (
              <div className={s.block}>
                <div className={s.mutedSmall}>Комментарий исполнителя</div>
                <div className={s.prewrap}>{sub.comment}</div>
              </div>
            )}

            {sub.reviewerComment && (
              <div className={s.block}>
                <div className={s.mutedSmall}>Комментарий проверяющего</div>
                <div className={s.prewrap}>{sub.reviewerComment}</div>
              </div>
            )}

            <div className={s.block}>
              <div className={s.brandHSmall}>Вложения</div>
              {validFiles.length === 0 ? (
                <div className={s.emptyText}>Файлы не прикреплены.</div>
              ) : (
                <ul className={s.fileList}>
                  {validFiles.map((sa) => {
                    const a = sa.attachment!;
                    const displayName =
                      a.originalName && a.originalName.toLowerCase() !== 'blob' ? a.originalName : a.name || 'без имени';
                    return (
                      <li key={`${a.name}-${String(a.createdAt)}`} className={s.fileItem}>
                        <div className={s.fileRow}>
                          <a href={`/api/files/${encodeURIComponent(a.name)}`} className={s.fileLink}>
                            {displayName}
                          </a>
                          <span className={s.fileMeta}>
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
    </main>
  );
}

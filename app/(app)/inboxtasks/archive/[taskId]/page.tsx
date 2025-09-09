// app/(app)/inboxtasks/archive/[taskId]/page.tsx
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole } from '@/lib/roles';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';

type Params = Promise<{ taskId: string }>;

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

type TaskFull = Prisma.TaskGetPayload<{
  include: {
    attachments: {
      select: {
        attachment: {
          select: { id: true; name: true; originalName: true; size: true; mime: true; createdAt: true };
        };
      };
    };
    assignees: {
      select: {
        id: true;
        status: true;
        completedAt: true;
        user: { select: { id: true; name: true } };
        submissions: {
          orderBy: [{ createdAt: 'desc' }];
          select: {
            createdAt: true;
            reviewedAt: true;
            comment: true;
            reviewerComment: true;
            attachments: {
              include: {
                attachment: {
                  select: { name: true; originalName: true; size: true; mime: true; createdAt: true };
                };
              };
            };
          };
        };
      };
    };
  };
}>;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Page({ params }: { params: Params }) {
  const { taskId } = await params;

  const session = await auth();
  const meId = session?.user?.id ?? null;
  normalizeRole(session?.user?.role); // сейчас не требуется для прав, но оставляю для единообразия
  if (!meId) redirect('/');

  const task: TaskFull | null = await prisma.task.findUnique({
    where: { id: taskId, hidden: { not: true } },
    include: {
      attachments: {
        select: {
          attachment: {
            select: { id: true, name: true, originalName: true, size: true, mime: true, createdAt: true },
          },
        },
      },
      assignees: {
        select: {
          id: true,
          status: true,
          completedAt: true,
          user: { select: { id: true, name: true } },
          submissions: {
            orderBy: [{ createdAt: 'desc' as const }],
            select: {
              createdAt: true,
              reviewedAt: true,
              comment: true,
              reviewerComment: true,
              attachments: {
                include: {
                  attachment: {
                    select: { name: true, originalName: true, size: true, mime: true, createdAt: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!task) redirect('/inboxtasks/archive');

  // Проверка доступа:
  const isOwner = task.createdById === meId;
  const myAssn = task.assignees.find(a => a.user?.id === meId);
  const iAmAssignee = Boolean(myAssn);

  if (!isOwner && !iAmAssignee) {
    // чужой архив — нельзя
    redirect('/inboxtasks/archive');
  }

  return (
    <main className="archive" style={{ padding: 16 }}>
      <a href="/inboxtasks/archive" className="backLink" style={{ textDecoration: 'none', fontSize: 13 }}>
        &larr; Назад к архиву
      </a>

      <header style={{ marginTop: 6, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{task.title}</h1>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          Дедлайн: {fmtRuDate(task.dueDate)} • Приоритет: {(task.priority ?? 'normal') === 'high' ? 'высокий' : 'обычный'}
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Назначил: <span className="brand">{task.createdByName ?? task.createdById}</span>
          {' • '}Проверяющий: {isOwner ? 'вы' : (task.createdByName ?? task.createdById)}
        </div>
      </header>

      {/* Участники */}
      <section className="cardSoft">
        <h2 className="brandH">Участники</h2>
        <div className="actors">
          <span className="pill"><span className="muted">Назначил:</span> <b className="brand">{task.createdByName ?? task.createdById}</b></span>
          <span className="pill"><span className="muted">Исполнителей:</span> <b>{task.assignees.length}</b></span>
          <span className="pill"><span className="muted">Вы:</span> <b>{isOwner ? 'создатель' : iAmAssignee ? 'исполнитель' : '—'}</b></span>
        </div>
      </section>

      {/* Описание */}
      {task.description && (
        <section className="cardSoft">
          <h2 className="brandH">Описание задачи</h2>
          <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            {task.description}
          </div>
        </section>
      )}

      {/* Файлы задачи */}
      <section className="cardSoft">
        <h2 className="brandH">Файлы задачи</h2>
        {task.attachments.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9ca3af' }}>Нет вложений.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {task.attachments.map(({ attachment }) => {
              const a = attachment;
              const title = a.originalName || a.name;
              return (
                <li key={a.id} style={{ marginBottom: 4 }}>
                  <a
                    href={`/api/files/${encodeURIComponent(a.name)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontWeight: 500, color: '#8d2828', textDecoration: 'underline' }}
                  >
                    {title}
                  </a>
                  <span style={{ color: '#6b7280', marginLeft: 6, fontSize: 12 }}>
                    {a.mime} • {fmtBytes(a.size)} • загружено {fmtRuDateTime(a.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* История сдач */}
      <section className="cardBrand">
        <h2 className="brandH">История сдач</h2>

        {isOwner ? (
          // Все исполнители — полная лента
          <div style={{ display: 'grid', gap: 12 }}>
            {task.assignees.length === 0 && (
              <div style={{ fontSize: 14, color: '#6b7280' }}>Исполнителей нет.</div>
            )}
            {task.assignees.map((a) => (
              <div key={a.id} className="assigneeBlock">
                <div className="assigneeHead">
                  <span className="chip">{a.user?.name ?? a.id}</span>
                  <span className={`chip ${a.status === 'done' ? 'chipDone' : ''}`}>
                    {a.status === 'done' ? 'принято' : a.status}
                  </span>
                  {a.completedAt && <span className="muted">• завершено {fmtRuDateTime(a.completedAt)}</span>}
                </div>

                {a.submissions.length === 0 ? (
                  <div className="muted">Сдач нет.</div>
                ) : (
                  <div className="timeline">
                    {a.submissions.map((s, idx) => (
                      <div key={idx} className="tlItem">
                        <div className="tlWhen">
                          Создано: {fmtRuDateTime(s.createdAt)}{s.reviewedAt ? ` • Проверено: ${fmtRuDateTime(s.reviewedAt)}` : ''}
                        </div>

                        {s.comment && (
                          <div className="tlBlock">
                            <div className="mutedSmall">Комментарий исполнителя</div>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{s.comment}</div>
                          </div>
                        )}

                        {s.reviewerComment && (
                          <div className="tlBlock">
                            <div className="reviewerH">Комментарий проверяющего</div>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{s.reviewerComment}</div>
                          </div>
                        )}

                        <div className="tlBlock">
                          <div className="mutedSmall">Вложения</div>
                          {s.attachments.length === 0 ? (
                            <div className="muted">Файлы не прикреплены.</div>
                          ) : (
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              {s.attachments.map((sa, j) => {
                                const att = sa.attachment!;
                                const name = att.originalName && att.originalName.toLowerCase() !== 'blob' ? att.originalName : att.name || 'без имени';
                                return (
                                  <li key={`${name}-${String(att.createdAt)}-${j}`} style={{ marginBottom: 4 }}>
                                    <a
                                      href={`/api/files/${encodeURIComponent(att.name)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{ fontWeight: 500, color: '#8d2828', textDecoration: 'underline' }}
                                    >
                                      {name}
                                    </a>
                                    <span style={{ color: '#6b7280', marginLeft: 6, fontSize: 12 }}>
                                      {att.mime} • {fmtBytes(att.size)} • загружено {fmtRuDateTime(att.createdAt)}
                                    </span>
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
              </div>
            ))}
          </div>
        ) : (
          // Только моя история
          <div style={{ display: 'grid', gap: 12 }}>
            {!myAssn ? (
              <div style={{ fontSize: 14, color: '#6b7280' }}>Вы не являетесь исполнителем этой задачи.</div>
            ) : myAssn.submissions.length === 0 ? (
              <div style={{ fontSize: 14, color: '#6b7280' }}>Сдач нет.</div>
            ) : (
              <div className="timeline">
                {myAssn.submissions.map((s, idx) => (
                  <div key={idx} className="tlItem">
                    <div className="tlWhen">
                      Создано: {fmtRuDateTime(s.createdAt)}{s.reviewedAt ? ` • Проверено: ${fmtRuDateTime(s.reviewedAt)}` : ''}
                    </div>

                    {s.comment && (
                      <div className="tlBlock">
                        <div className="mutedSmall">Комментарий исполнителя</div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{s.comment}</div>
                      </div>
                    )}

                    {s.reviewerComment && (
                      <div className="tlBlock">
                        <div className="reviewerH">Комментарий проверяющего</div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{s.reviewerComment}</div>
                      </div>
                    )}

                    <div className="tlBlock">
                      <div className="mutedSmall">Вложения</div>
                      {s.attachments.length === 0 ? (
                        <div className="muted">Файлы не прикреплены.</div>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {s.attachments.map((sa, j) => {
                            const att = sa.attachment!;
                            const name = att.originalName && att.originalName.toLowerCase() !== 'blob' ? att.originalName : att.name || 'без имени';
                            return (
                              <li key={`${name}-${String(att.createdAt)}-${j}`} style={{ marginBottom: 4 }}>
                                <a
                                  href={`/api/files/${encodeURIComponent(att.name)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ fontWeight: 500, color: '#8d2828', textDecoration: 'underline' }}
                                >
                                  {name}
                                </a>
                                <span style={{ color: '#6b7280', marginLeft: 6, fontSize: 12 }}>
                                  {att.mime} • {fmtBytes(att.size)} • загружено {fmtRuDateTime(att.createdAt)}
                                </span>
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
          </div>
        )}
      </section>

      <style>{`
        .archive { --brand:#8d2828; }
        .brand { color: var(--brand); }

        .cardBrand { border: 2px solid var(--brand); border-radius: 12px; padding: 12px; background: #fff; margin-bottom: 12px; }
        .cardSoft { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; background: #fff; margin-bottom: 12px; }

        .brandH { margin: 0 0 6px 0; font-size: 18px; color: var(--brand); }

        .actors { display:flex; gap:8px; flex-wrap:wrap; }
        .pill { border:1px solid #e5e7eb; border-radius:999px; padding:4px 10px; font-size:13px; background:#fff; display:inline-flex; align-items:center; gap:6px; }
        .muted { color:#6b7280; }
        .mutedSmall { color:#6b7280; font-size:13px; }
        .reviewerH { color:#b91c1c; font-size:13px; }

        .timeline { display:grid; gap:12px; }
        .tlItem { border-top:1px solid #f3f4f6; padding-top:8px; }
        .tlWhen { font-size:12px; color:#374151; }
        .tlBlock { margin-top:6px; }

        .chip { border:1px solid #e5e7eb; border-radius:999px; padding: 2px 8px; font-size:12px; background:#fff; }
        .chipDone { background:#ecfdf5; border-color:#d1fae5; }

        .backLink { color:#111827; }

        @media (max-width: 720px) {
          .actors { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </main>
  );
}

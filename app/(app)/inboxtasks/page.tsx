import { Suspense } from 'react';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks } from '@/lib/roles';
import TaskForm from './TaskForm';
import {
  createTaskAction,
  updateTaskAction,
  deleteTaskAction,
  markAssigneeDoneAction,
} from './actions';
import type { Prisma } from '@prisma/client';
import './inboxtasks.css';
import ReviewSubmitForm from './ReviewSubmitForm';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type TaskWithAssignees = Prisma.TaskGetPayload<{
  select: {
    id: true;
    number: true;
    title: true;
    description: true;
    dueDate: true;
    priority: true;
    hidden: true;
    createdById: true;
    createdByName: true;
    reviewRequired: true;
    assignees: {
      include: {
        user: { select: { id: true; name: true } };
        submissions: {
          where: { open: false };
          orderBy: { reviewedAt: 'desc' };
          take: 1;
          select: { reviewerComment: true; reviewedAt: true };
        };
      };
    };
    attachments: {
      select: {
        attachment: {
          select: { id: true; name: true; originalName: true; size: true; mime: true }
        }
      }
    };
  };
}>;

function fmtRuDateTimeYekb(input: string | Date) {
  const dt = typeof input === 'string' ? new Date(input) : input;
  const dateParts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).formatToParts(dt).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const dd = dateParts.day;
  const month = dateParts.month;
  const yyyy = dateParts.year;

  const timeParts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(dt);
  const hh = timeParts.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = timeParts.find((p) => p.type === 'minute')?.value ?? '00';

  const isDefaultEnd = hh === '23' && mm === '59';
  return isDefaultEnd ? `${dd} ${month} ${yyyy}` : `${dd} ${month} ${yyyy}, ${hh}:${mm}`;
}

function TeacherGuide() {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff', fontSize: 14, lineHeight: 1.5 }}>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>Как работать с задачами</h3>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>Во вкладке «Назначенные мне» вы видите актуальные задачи, назначенные вам руководителями.</li>
        <li>Нажмите «Выполнить», когда закончите работу — она уйдёт в архив.</li>
        <li>Если задача с проверкой — отправьте на ревью с комментариями и файлами.</li>
      </ul>
    </div>
  );
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const tabParam = typeof sp.tab === 'string' ? sp.tab : Array.isArray(sp.tab) ? sp.tab[0] : undefined;

  const session = await auth();
  const meId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);
  const mayCreate = canCreateTasks(role);

  if (!meId) {
    return (
      <main style={{ padding: 16 }}>
        <h1>Задачи</h1>
        <p>Не авторизовано.</p>
      </main>
    );
  }

  const reviewFlowOn = process.env.NEXT_PUBLIC_REVIEW_FLOW === '1';

  const [users, groups, subjects] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true, methodicalGroups: true, subjects: true },
    }),
    prisma.group.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.subject.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  const groupMembers = await prisma.groupMember.findMany({ select: { groupId: true, userId: true } });
  const rawSubjectMembers = await prisma.subjectMember.findMany({
    select: { userId: true, subject: { select: { name: true } } },
  });
  const subjectMembers = rawSubjectMembers.map((m) => ({ userId: m.userId, subjectName: m.subject.name }));

  const [mineInProgress, assignedByMe] = await Promise.all([
    prisma.task.findMany({
      where: {
        hidden: { not: true }, // NULL-safe
        assignees: { some: { userId: meId, status: 'in_progress' } }
      },
      select: {
        id: true, number: true, title: true, description: true, dueDate: true,
        priority: true, hidden: true, createdById: true, createdByName: true,
        reviewRequired: true,
        assignees: {
          include: {
            user: { select: { id: true, name: true } },
            submissions: {
              where: { open: false },
              orderBy: { reviewedAt: 'desc' as const },
              take: 1,
              select: { reviewerComment: true, reviewedAt: true },
            },
          },
        },
        attachments: { select: { attachment: { select: { id: true, name: true, originalName: true, size: true, mime: true } } } },
      },
      orderBy: { dueDate: 'asc' as const },
    }),
    prisma.task.findMany({
      where: { createdById: meId, hidden: { not: true } }, // NULL-safe
      select: {
        id: true, number: true, title: true, description: true, dueDate: true,
        priority: true, hidden: true, createdById: true, createdByName: true,
        reviewRequired: true,
        assignees: {
          include: {
            user: { select: { id: true, name: true } },
            submissions: {
              where: { open: false },
              orderBy: { reviewedAt: 'desc' as const },
              take: 1,
              select: { reviewerComment: true, reviewedAt: true },
            },
          },
        },
        attachments: { select: { attachment: { select: { id: true, name: true, originalName: true, size: true, mime: true } } } },
      },
      orderBy: { dueDate: 'desc' as const },
      take: 30,
    }),
  ]);

  const activeTab = tabParam === 'byme' ? 'byme' : 'mine';

  const statusRu = (s: string) =>
    s === 'in_progress' ? 'в работе'
    : s === 'submitted'  ? 'на проверке'
    : s === 'done'       ? 'принято'
    : s === 'rejected'   ? 'возвращено'
    : s;

  function TaskAttachments({ items }: { items: { attachment: { id: string; name: string; originalName: string | null; size: number; mime: string } }[] }) {
    if (!items?.length) return <span>Нет вложений</span>;
    return (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map(({ attachment }) => {
          const title = attachment.originalName || attachment.name;
          const href = `/api/files/${attachment.name}`;
          const sizeKb = Math.max(1, Math.round(attachment.size / 1024));
          return (
            <li key={attachment.id} style={{ marginBottom: 4 }}>
              <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                {title}
              </a>
              <span style={{ color: '#6b7280', marginLeft: 6, fontSize: 12 }}>
                ({attachment.mime}, ~{sizeKb} КБ)
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Задачи</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16 }}>
        <aside className="leftCol">
          {mayCreate ? (
            <section aria-label="Создать задачу" className="card">
              <Suspense fallback={null}>
                <TaskForm
                  users={users}
                  groups={groups}
                  subjects={subjects.map((s) => ({ name: s.name }))}
                  groupMembers={groupMembers}
                  subjectMembers={subjectMembers}
                  createAction={createTaskAction}
                  allowReviewControls={mayCreate}
                />
              </Suspense>
            </section>
          ) : (
            <TeacherGuide />
          )}
        </aside>

        <section className="rightCol">
          <header className="tabsWrap">
            <nav className="tabs">
              <a href="/inboxtasks?tab=mine" className={activeTab === 'mine' ? 'tabActive' : 'tab'}>Назначенные мне</a>
              {mayCreate && <a href="/inboxtasks?tab=byme" className={activeTab === 'byme' ? 'tabActive' : 'tab'}>Назначенные мной</a>}
            </nav>
          </header>

          <div className="lists">
            {/* Назначенные мне */}
            {activeTab === 'mine' && (
              <section>
                {mineInProgress.length === 0 ? (
                  <div className="empty">Нет активных задач.</div>
                ) : (
                  mineInProgress.map((t) => {
                    const myAssn = t.assignees.find((a) => a.userId === meId);
                    const requiresReview = reviewFlowOn && t.reviewRequired === true;
                    const lastComment = myAssn?.submissions?.[0]?.reviewerComment;
                    return (
                      <details key={t.id} className="taskCard" style={t.priority === 'high' ? { borderColor: '#8d2828' } : undefined}>
                        <summary className="taskHeader">
                          <div className="taskTitle">
                            <b>№{t.number} — {t.title}</b>
                            <span className="taskMeta">
                              до {fmtRuDateTimeYekb(t.dueDate)}
                              {t.priority === 'high' ? ' • высокий приоритет' : ''}
                              {t.createdByName ? ` • назначил: ${t.createdByName}` : ''}
                              {requiresReview && lastComment ? ' • есть комментарий проверяющего' : ''}
                            </span>
                          </div>
                        </summary>

                        <div className="taskBody">
                          {t.description && (
                            <div className="taskSection">
                              <h4>Описание</h4>
                              <div style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{t.description}</div>
                            </div>
                          )}

                          <div className="taskSection">
                            <h4>Вложения</h4>
                            <TaskAttachments items={t.attachments} />
                          </div>

                          <div className="taskSection">
                            {requiresReview ? (
                              <ReviewSubmitForm taskId={t.id} disabled={myAssn?.status === 'done' || myAssn?.status === 'submitted'} />
                            ) : (
                              <form action={markAssigneeDoneAction}>
                                <input type="hidden" name="taskId" value={t.id} />
                                <button type={myAssn?.status === 'done' ? 'button' : 'submit'} className="btnPrimaryGreen" disabled={myAssn?.status === 'done'}>
                                  Выполнить
                                </button>
                              </form>
                            )}
                          </div>

                          {myAssn && (
                            <div className="taskSection">
                              <div>Мой статус: <b>{statusRu(myAssn.status)}</b></div>
                              {requiresReview && lastComment && (
                                <div style={{ marginTop: 4 }}>Комментарий проверяющего: {lastComment}</div>
                              )}
                            </div>
                          )}
                        </div>
                      </details>
                    );
                  })
                )}
              </section>
            )}

            {/* Назначенные мной */}
            {activeTab === 'byme' && mayCreate && (
              <section>
                {assignedByMe.length === 0 ? (
                  <div className="empty">Нет задач, назначенных вами.</div>
                ) : (
                  assignedByMe.map((t) => {
                    const doneCnt = t.assignees.filter(a => a.status === 'done').length;
                    const onReviewCnt = t.assignees.filter(a => a.status === 'submitted').length;
                    const totalCnt = t.assignees.length;
                    const updateFormId = `update-${t.id}`;
                    const visible = t.assignees.slice(0, 7);
                    const rest = t.assignees.slice(7);

                    return (
                      <details key={t.id} className="taskCard" style={t.priority === 'high' ? { borderColor: '#8d2828' } : undefined}>
                        <summary className="taskHeader">
                          <div className="taskTitle">
                            <b>№{t.number} — {t.title}</b>
                            <span className="taskMeta">
                              до {fmtRuDateTimeYekb(t.dueDate)}
                              {t.priority === 'high' ? ' • высокий приоритет' : ''}
                              {' • '}исполнители: {doneCnt}/{totalCnt}
                              {onReviewCnt ? ` • на проверке: ${onReviewCnt}` : ''}
                            </span>
                          </div>
                          <div className="taskActions">
                            <form action={deleteTaskAction}>
                              <input type="hidden" name="taskId" value={t.id} />
                              <button type="submit" className="btnDanger">Удалить</button>
                            </form>
                          </div>
                        </summary>

                        <div className="taskBody">
                          {t.description && (
                            <div className="taskSection">
                              <h4>Описание</h4>
                              <div style={{ whiteSpace:'pre-wrap' }}>{t.description}</div>
                            </div>
                          )}

                          <div className="taskSection">
                            <h4>Вложения</h4>
                            <TaskAttachments items={t.attachments} />
                          </div>

                          <div className="taskSection">
                            <h4>Исполнители</h4>
                            <div style={{ display:'grid', gap:6 }}>
                              {visible.map(a => {
                                const lastComment = a.submissions?.[0]?.reviewerComment;
                                return (
                                  <div key={a.id}>
                                    <div style={{ fontSize:13 }}>
                                      <b>{a.user?.name || a.userId}</b>
                                      <span style={{ color:'#6b7280' }}> • {statusRu(a.status)}</span>
                                    </div>
                                    {a.status === 'submitted' && <a href={`/reviews/${a.id}`} className="btnGhost">Открыть проверку</a>}
                                    {t.reviewRequired && lastComment && (
                                      <div style={{ fontSize:13, color:'#374151' }}>Комментарий проверяющего: {lastComment}</div>
                                    )}
                                  </div>
                                );
                              })}
                              {rest.length > 0 && (
                                <details>
                                  <summary className="btnGhost" style={{ cursor:'pointer' }}>
                                    Показать всех ({t.assignees.length})
                                  </summary>
                                  <div style={{ display:'grid', gap:6, marginTop:8 }}>
                                    {rest.map(a => {
                                      const lastComment = a.submissions?.[0]?.reviewerComment;
                                      return (
                                        <div key={a.id}>
                                          <div style={{ fontSize:13 }}>
                                            <b>{a.user?.name || a.userId}</b>
                                            <span style={{ color:'#6b7280' }}> • {statusRu(a.status)}</span>
                                          </div>
                                          {a.status === 'submitted' && <a href={`/reviews/${a.id}`} className="btnGhost">Открыть проверку</a>}
                                          {t.reviewRequired && lastComment && (
                                            <div style={{ fontSize:13, color:'#374151' }}>Комментарий проверяющего: {lastComment}</div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </details>
                              )}
                            </div>
                          </div>

                          <div className="taskSection">
                            <details>
                              <summary style={{ cursor:'pointer', fontSize:13 }}>Редактировать</summary>
                              <form id={updateFormId} action={updateTaskAction} style={{ display:'grid', gap:8, marginTop:8 }}>
                                <input type="hidden" name="taskId" value={t.id} />
                                <label>Название<input type="text" name="title" defaultValue={t.title} /></label>
                                <label>Описание<textarea name="description" defaultValue={t.description ?? ''} rows={3} /></label>
                                <label>Дедлайн
                                  <input type="datetime-local" name="dueDate" defaultValue={new Date(t.dueDate).toISOString().slice(0,16)} />
                                </label>
                                <label>Приоритет
                                  <select name="priority" defaultValue={t.priority ?? 'normal'}>
                                    <option value="normal">Обычный</option>
                                    <option value="high">Высокий</option>
                                  </select>
                                </label>
                              </form>
                              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                                <button type="submit" form={updateFormId} className="btnGhost">Сохранить</button>
                                <form action={deleteTaskAction}>
                                  <input type="hidden" name="taskId" value={t.id} />
                                  <button type="submit" className="btnDanger">Удалить</button>
                                </form>
                              </div>
                            </details>
                          </div>
                        </div>
                      </details>
                    );
                  })
                )}
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

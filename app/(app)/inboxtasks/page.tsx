﻿// app/(app)/inboxtasks/page.tsx
import { Suspense } from 'react';
import Link from 'next/link';
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
import { cookies } from 'next/headers';
import Badge from './Badge';

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
  }, {} as Record<string, string>);
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
        <li>Если задача с проверкой — отправьте на проверку с комментариями и файлами.</li>
      </ul>
    </div>
  );
}

/* Компактный блок «Вложения» с иконками по типу файла */
function TaskAttachments({
  items,
}: {
  items: { attachment: { id: string; name: string; originalName: string | null; size: number; mime: string } }[];
}) {
  if (!items?.length) return <span>Нет вложений</span>;
  return (
    <section className="attachBox">
      <h4 style={{ color: '#8d2828' }}>Вложения (файлы)</h4>
      <ul className="attachList">
        {items.map(({ attachment }) => {
          const name = attachment.originalName || attachment.name;
          const href = `/api/files/${attachment.name}`;
          const sizeKb = Math.max(1, Math.round(attachment.size / 1024));
          const ext = (name.split('.').pop() || '').toLowerCase();
          return (
            <li key={attachment.id} className="attachItem" data-ext={ext}>
              <span className="attachIcon" aria-hidden="true" />
              <a
                className="attachLink"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                download
                title={name}
              >
                <span className="attachName">{name}</span>
              </a>
              <span style={{ color: '#6b7280', marginLeft: 'auto', fontSize: 12 }}>
                {attachment.mime}, ~{sizeKb} КБ
              </span>
            </li>
          );
        })}
      </ul>
    </section>
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
    select: { userId: true, subject: { select: { name: true} } },
  });
  const subjectMembers = rawSubjectMembers.map((m) => ({ userId: m.userId, subjectName: m.subject.name }));

  const [mineInProgress, mineSubmitted, assignedByMe] = await Promise.all([
    prisma.task.findMany({
      where: {
        hidden: { not: true },
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
      where: {
        hidden: { not: true },
        assignees: { some: { userId: meId, status: 'submitted' } }
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
          where: { userId: meId },
        },
        attachments: { select: { attachment: { select: { id: true, name: true, originalName: true, size: true, mime: true } } } },
      },
      orderBy: { dueDate: 'asc' as const },
    }),
    prisma.task.findMany({
      where: { createdById: meId, hidden: { not: true } },
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

  const activeTab = tabParam === 'byme' ? 'byme' : tabParam === 'submitted' ? 'submitted' : 'mine';

  // читаем куку и определяем начальную свёрнутость формы
  const cookieStore = await cookies();
  const formCollapsed = cookieStore.get('inboxtasks_taskform_collapsed')?.value === '1';

  const statusRu = (s: string) =>
    s === 'in_progress' ? 'в работе'
    : s === 'submitted'  ? 'на проверке'
    : s === 'done'       ? 'принято'
    : s === 'rejected'   ? 'возвращено'
    : s;

  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Задачи</h1>

      <div className="layout">
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
                  initialCollapsed={formCollapsed}
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
              <a href="/inboxtasks?tab=submitted" className={activeTab === 'submitted' ? 'tabActive' : 'tab'}>На проверке</a>
              {mayCreate && (
                <Link href="/inboxtasks/byme/search" className={activeTab === 'byme' ? 'tabActive' : 'tab'}>
                  Назначенные мной
                </Link>
              )}
            </nav>
          </header>

          <div className="lists">
            {activeTab === 'mine' && (
              <section>
                {mineInProgress.length === 0 ? (
                  <div className="empty">Нет активных задач.</div>
                ) : (
                  mineInProgress.map((t) => {
                    const myAssn = t.assignees.find((a) => a.userId === meId);
                    const requiresReview = t.reviewRequired === true;
                    const lastComment = myAssn?.submissions?.[0]?.reviewerComment;
                    const showUrgent = t.priority === 'high';
                    const showRedo = (myAssn?.status === 'in_progress' && !!myAssn?.reviewedAt) || myAssn?.status === 'rejected';

                    return (
                      <details key={t.id} className="taskCard" data-urgent={showUrgent ? 'true' : 'false'}>
                        <summary className="taskHeader">
                          <div className="taskTitle">
                            <b>№{t.number} — {t.title}</b>
                            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginTop:4 }}>
                              {showRedo && <Badge kind="redo">доработка</Badge>}
                              <span className="taskMeta">
                                до {fmtRuDateTimeYekb(t.dueDate)}
                                {t.createdByName ? <> • назначил: <span style={{ color: '#8d2828' }}>{t.createdByName}</span></> : ''}
                              </span>
                            </div>
                          </div>
                        </summary>

                        <div className="taskBody">
                          {requiresReview && lastComment && (
                            <div className="taskSection" style={{ borderColor: '#8d2828' }}>
                              <h4 style={{ color: '#fc0202ff', marginTop: 0 }}>Комментарий проверяющего</h4>
                              <div style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{lastComment}</div>
                            </div>
                          )}

                          {t.description && (
                            <div className="taskSection" style={{ borderColor: '#8d2828' }}>
                              <h4 style={{ color: '#8d2828' }}>Описание задачи</h4>
                              <div style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{t.description}</div>
                            </div>
                          )}

                          <TaskAttachments items={t.attachments} />

                          <div className="taskSection" style={{ borderColor: '#8d2828' }}>
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
                            <div className="taskSection" style={{ borderColor: '#8d2828' }}>
                              <div>Мой статус: <b>{statusRu(myAssn.status)}</b></div>
                            </div>
                          )}
                        </div>
                      </details>
                    );
                  })
                )}
              </section>
            )}

            {activeTab === 'submitted' && (
              <section>
                {mineSubmitted.length === 0 ? (
                  <div className="empty">Нет задач, отправленных на проверку.</div>
                ) : (
                  mineSubmitted.map((t) => {
                    const myAssn = t.assignees.find((a) => a.userId === meId);
                    const lastComment = myAssn?.submissions?.[0]?.reviewerComment;
                    const showUrgent = t.priority === 'high';
                    const showRedo = (myAssn?.status === 'in_progress' && !!myAssn?.reviewedAt) || myAssn?.status === 'rejected';

                    return (
                      <details key={t.id} className="taskCard" data-urgent={showUrgent ? 'true' : 'false'}>
                        <summary className="taskHeader">
                          <div className="taskTitle">
                            <b>№{t.number} — {t.title}</b>
                            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginTop:4 }}>
                              {showRedo && <Badge kind="redo">доработка</Badge>}
                              <span className="taskMeta">
                                до {fmtRuDateTimeYekb(t.dueDate)}
                                {t.createdByName ? <> • назначил: <span style={{ color: '#8d2828' }}>{t.createdByName}</span></> : ''}
                                {' • '}статус: <b>{statusRu(myAssn?.status ?? 'submitted')}</b>
                              </span>
                            </div>
                          </div>
                        </summary>

                        <div className="taskBody">
                          {lastComment && (
                            <div className="taskSection" style={{ borderColor: '#8d2828' }}>
                              <h4 style={{ color: '#fc0202ff', marginTop: 0 }}>Комментарий проверяющего</h4>
                              <div style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{lastComment}</div>
                            </div>
                          )}

                          {t.description && (
                            <div className="taskSection" style={{ borderColor: '#8d2828' }}>
                              <h4 style={{ color: '#8d2828' }}>Описание задачи</h4>
                              <div style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{t.description}</div>
                            </div>
                          )}

                          <TaskAttachments items={t.attachments} />
                        </div>
                      </details>
                    );
                  })
                )}
              </section>
            )}

            {activeTab === 'byme' && mayCreate && (
              <section>
                {assignedByMe.length === 0 ? (
                  <div className="empty">Нет задач, назначенных вами.</div>
                ) : (
                  assignedByMe.map((t) => {
                    const doneCnt = t.assignees.filter(a => a.status === 'done').length;
                    const onReviewCnt = t.assignees.filter(a => a.status === 'submitted').length;
                    const anyRedo = t.assignees.some(a => (a.status === 'in_progress' && !!a.reviewedAt) || a.status === 'rejected');
                    const totalCnt = t.assignees.length;
                    const updateFormId = `update-${t.id}`;
                    const visible = t.assignees.slice(0, 7);
                    const rest = t.assignees.slice(7);
                    const showUrgent = t.priority === 'high';

                    return (
                      <details key={t.id} className="taskCard" data-urgent={showUrgent ? 'true' : 'false'}>
                        <summary className="taskHeader">
                          <div className="taskTitle">
                            <b>№{t.number} — {t.title}</b>
                            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginTop:4 }}>
                              {anyRedo && <Badge kind="redo">доработка</Badge>}
                              <span className="taskMeta">
                                до {fmtRuDateTimeYekb(t.dueDate)}
                                {' • '}исполнители: {doneCnt}/{totalCnt}
                                {onReviewCnt ? ` • на проверке: ${onReviewCnt}` : ''}
                              </span>
                            </div>
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
                            <div className="taskSection" style={{ borderColor: '#8d2828' }}>
                              <h4 style={{ color: '#8d2828' }}>Описание задачи</h4>
                              <div style={{ whiteSpace:'pre-wrap' }}>{t.description}</div>
                            </div>
                          )}

                          <TaskAttachments items={t.attachments} />

                          <div className="taskSection" style={{ borderColor: '#8d2828' }}>
                            <h4 style={{ color: '#8d2828' }}>Исполнители</h4>
                            <div style={{ display:'grid', gap:6 }}>
                              {visible.map(a => {
                                const lastComment = a.submissions?.[0]?.reviewerComment;
                                const redo = (a.status === 'in_progress' && !!a.reviewedAt) || a.status === 'rejected';
                                return (
                                  <div key={a.id}>
                                    <div style={{ fontSize:13, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                                      <b>{a.user?.name || a.userId}</b>
                                      <span style={{ color:'#6b7280' }}> • {statusRu(a.status)}</span>
                                      {redo && <Badge kind="redo">доработка</Badge>}
                                    </div>
                                    {t.reviewRequired && lastComment && (
                                      <div style={{ fontSize:13, color:'#374151' }}>
                                        <span style={{ color: '#ef4444' }}>Комментарий проверяющего:</span> {lastComment}
                                      </div>
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
                                      const redo = (a.status === 'in_progress' && !!a.reviewedAt) || a.status === 'rejected';
                                      return (
                                        <div key={a.id}>
                                          <div style={{ fontSize:13, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                                            <b>{a.user?.name || a.userId}</b>
                                            <span style={{ color:'#6b7280' }}> • {statusRu(a.status)}</span>
                                            {redo && <Badge kind="redo">доработка</Badge>}
                                          </div>
                                          {t.reviewRequired && lastComment && (
                                            <div style={{ fontSize:13, color:'#374151' }}>
                                              <span style={{ color: '#ef4444' }}>Комментарий проверяющего:</span> {lastComment}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </details>
                              )}
                            </div>
                          </div>

                          <div className="taskSection" style={{ borderColor: '#8d2828' }}>
                            <details>
                              <summary style={{ cursor:'pointer', fontSize:13 }}>Редактировать</summary>
                              <form id={updateFormId} action={updateTaskAction} style={{ display:'grid', gap:8, marginTop:8 }}>
                                <input type="hidden" name="taskId" value={t.id} />
                                <label>Название<input type="text" name="title" defaultValue={t.title} /></label>
                                <label>Описание задачи<textarea name="description" defaultValue={t.description ?? ''} rows={3} /></label>
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

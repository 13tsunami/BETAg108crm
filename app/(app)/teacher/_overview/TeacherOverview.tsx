import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { hasFullAccess, type Role } from '@/lib/roles';
import { roleLabel } from '@/lib/roleLabels';
import s from './overview.module.css';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/* ===== Русские метки ===== */
function taskAssigneeStatusLabel(v: string): string {
  switch (v) {
    case 'in_progress': return 'в работе';
    case 'submitted':   return 'отправлено';
    case 'done':        return 'выполнено';
    case 'rejected':    return 'возвращено';
    default:            return v;
  }
}
function requestStatusLabel(v: string): string {
  switch (v) {
    case 'new':         return 'новая';
    case 'in_progress': return 'в работе';
    case 'done':        return 'закрыта';
    case 'rejected':    return 'отклонена';
    default:            return v;
  }
}

const SCHOOL_TZ = 'Asia/Yekaterinburg';

function fmtRuDateTimeYekb(input: string | Date) {
  const dt = typeof input === 'string' ? new Date(input) : input;
  const date = new Intl.DateTimeFormat('ru-RU', {
    timeZone: SCHOOL_TZ,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(dt);
  const time = new Intl.DateTimeFormat('ru-RU', {
    timeZone: SCHOOL_TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt);
  return `${date} ${time}`;
}

/* ===== Модалки (серверные компоненты) ===== */

async function TaskDetailsModal({ taskId }: { taskId: string }) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true, number: true, title: true, description: true,
      createdAt: true, updatedAt: true, dueDate: true, priority: true,
      reviewRequired: true, createdByName: true,
      tags: { select: { tag: { select: { id: true, name: true } } } },
      attachments: { select: { attachment: { select: { id: true, name: true, originalName: true, size: true, mime: true, createdAt: true } } } },
      assignees: {
        select: {
          id: true, status: true, assignedAt: true, completedAt: true, submittedAt: true, reviewedAt: true,
          user: { select: { id: true, name: true } },
          submissions: {
            select: {
              id: true, createdAt: true, open: true, reviewedAt: true, reviewerComment: true,
              attachments: { select: { attachment: { select: { id: true, name: true, size: true, mime: true } } } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: [{ status: 'asc' }, { assignedAt: 'asc' }],
      },
    },
  });
  if (!task) return null;

  return (
    <div className={s.modalBackdrop}>
      <div className={s.modal}>
        <div className={s.modalHead}>
          <div className={s.modalTitle}><span className={s.cardNumber}>#{task.number}</span> {task.title}</div>
          <Link href={`?`} className={s.modalClose} aria-label="Закрыть">×</Link>
        </div>

        <div className={s.modalMeta}>
          <span>создано: {fmtRuDateTimeYekb(task.createdAt)}</span>
          <span>изменено: {fmtRuDateTimeYekb(task.updatedAt)}</span>
          <span>дедлайн: {fmtRuDateTimeYekb(task.dueDate)}</span>
          <span>приоритет: {task.priority}</span>
          {task.reviewRequired ? <span className={s.badgeMuted}>на проверке</span> : null}
          {task.createdByName ? <span>автор: {task.createdByName}</span> : null}
        </div>

        {task.description ? <div className={s.modalSection}>{task.description}</div> : null}

        {task.tags.length > 0 && (
          <div className={s.modalSection}>
            {task.tags.map(t => <span key={t.tag.id} className={s.badge}>{t.tag.name}</span>)}
          </div>
        )}

        {task.attachments.length > 0 && (
          <div className={s.modalSection}>
            <div className={s.blockSubhead}>Вложения</div>
            <ul className={s.attachList}>
              {task.attachments.map(a => (
                <li key={a.attachment.id}>
                  {a.attachment.originalName ?? a.attachment.name} • {(a.attachment.size / 1024).toFixed(1)} КБ • {a.attachment.mime}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={s.modalSection}>
          <div className={s.blockSubhead}>Исполнители</div>
          <div className={`${s.list} ${task.assignees.length > 8 ? s.scroll : ''}`}>
            {task.assignees.map(asg => (
              <div key={asg.id} className={s.card}>
                <div className={s.cardRow}>
                  <span className={s.status}>{taskAssigneeStatusLabel(asg.status)}</span>
                  <span>назначено: {fmtRuDateTimeYekb(asg.assignedAt)}</span>
                  {asg.completedAt ? <span>выполнено: {fmtRuDateTimeYekb(asg.completedAt)}</span> : null}
                </div>
                <div className={s.cardTitle}>{asg.user.name}</div>
                <div className={s.subBlock}>
                  {asg.submissions.length === 0 ? 'Отправок нет' : (
                    <>
                      Последние отправки:
                      <ul className={s.attachList}>
                        {asg.submissions.map(sub => (
                          <li key={sub.id}>
                            {fmtRuDateTimeYekb(sub.createdAt)}
                            {sub.reviewerComment ? ` — ${sub.reviewerComment}` : ''}
                            {sub.attachments.length > 0 ? ` • файлов: ${sub.attachments.length}` : ''}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

async function AssigneeDetailsModal({ assigneeId }: { assigneeId: string }) {
  const asg = await prisma.taskAssignee.findUnique({
    where: { id: assigneeId },
    select: {
      id: true, status: true, assignedAt: true, completedAt: true, submittedAt: true, reviewedAt: true,
      user: { select: { id: true, name: true } },
      task: {
        select: {
          id: true, number: true, title: true, description: true, dueDate: true, priority: true,
          createdAt: true, createdByName: true, reviewRequired: true,
        },
      },
      submissions: {
        select: {
          id: true, createdAt: true, open: true, reviewedAt: true, reviewerComment: true,
          attachments: { select: { attachment: { select: { id: true, name: true, size: true, mime: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!asg) return null;

  return (
    <div className={s.modalBackdrop}>
      <div className={s.modal}>
        <div className={s.modalHead}>
          <div className={s.modalTitle}>
            <span className={s.cardNumber}>#{asg.task.number}</span> {asg.task.title}
          </div>
          <Link href={`?`} className={s.modalClose} aria-label="Закрыть">×</Link>
        </div>

        <div className={s.modalMeta}>
          <span>назначено: {fmtRuDateTimeYekb(asg.assignedAt)}</span>
          <span>дедлайн: {fmtRuDateTimeYekb(asg.task.dueDate)}</span>
          <span>приоритет: {asg.task.priority}</span>
          {asg.task.reviewRequired ? <span className={s.badgeMuted}>на проверке</span> : null}
          {asg.task.createdByName ? <span>назначил: {asg.task.createdByName}</span> : null}
          <span>статус: {taskAssigneeStatusLabel(asg.status)}</span>
        </div>

        {asg.task.description ? <div className={s.modalSection}>{asg.task.description}</div> : null}

        <div className={s.modalSection}>
          <div className={s.blockSubhead}>Мои отправки</div>
          <div className={`${s.list} ${asg.submissions.length > 8 ? s.scroll : ''}`}>
            {asg.submissions.length === 0 ? (
              <div className={s.empty}>Отправок ещё нет</div>
            ) : (
              asg.submissions.map(sub => (
                <div key={sub.id} className={s.card}>
                  <div className={s.cardRow}>
                    <span>{fmtRuDateTimeYekb(sub.createdAt)}</span>
                    {sub.reviewedAt ? <span>проверено: {fmtRuDateTimeYekb(sub.reviewedAt)}</span> : null}
                  </div>
                  {sub.reviewerComment ? <div className={s.subBlock}>{sub.reviewerComment}</div> : null}
                  {sub.attachments.length > 0 ? (
                    <div className={s.subBlock}>Файлы: {sub.attachments.length}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

async function NoteModal({ noteId }: { noteId: string }) {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: { id: true, at: true, allDay: true, title: true, text: true, createdAt: true, updatedAt: true },
  });
  if (!note) return null;

  return (
    <div className={s.modalBackdrop}>
      <div className={s.modal}>
        <div className={s.modalHead}>
          <div className={s.modalTitle}>{note.title ?? 'Заметка'}</div>
          <Link href={`?`} className={s.modalClose} aria-label="Закрыть">×</Link>
        </div>
        <div className={s.modalMeta}>
          <span>{note.allDay ? 'весь день' : fmtRuDateTimeYekb(note.at)}</span>
          <span>создано: {fmtRuDateTimeYekb(note.createdAt)}</span>
          <span>изменено: {fmtRuDateTimeYekb(note.updatedAt)}</span>
        </div>
        <div className={s.modalSection}>{note.text}</div>
      </div>
    </div>
  );
}

async function RequestModal({ requestId }: { requestId: string }) {
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    select: {
      id: true, createdAt: true, updatedAt: true, title: true, body: true,
      target: true, status: true, author: { select: { id: true, name: true } },
      processedBy: { select: { id: true, name: true } },
      messages: {
        select: { id: true, createdAt: true, body: true, author: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!req) return null;

  return (
    <div className={s.modalBackdrop}>
      <div className={s.modal}>
        <div className={s.modalHead}>
          <div className={s.modalTitle}>{req.title}</div>
          <Link href={`?`} className={s.modalClose} aria-label="Закрыть">×</Link>
        </div>
        <div className={s.modalMeta}>
          <span>статус: {requestStatusLabel(req.status)}</span>
          <span>адресат: {req.target}</span>
          <span>создано: {fmtRuDateTimeYekb(req.createdAt)}</span>
          <span>обновлено: {fmtRuDateTimeYekb(req.updatedAt)}</span>
          <span>автор: {req.author?.name ?? '—'}</span>
          {req.processedBy ? <span>обработчик: {req.processedBy.name}</span> : null}
        </div>
        <div className={s.modalSection}>{req.body}</div>

        <div className={s.modalSection}>
          <div className={s.blockSubhead}>Сообщения</div>
          <div className={`${s.list} ${req.messages.length > 8 ? s.scroll : ''}`}>
            {req.messages.length === 0 ? <div className={s.empty}>Сообщений нет</div> : req.messages.map(m => (
              <div key={m.id} className={s.card}>
                <div className={s.cardRow}>
                  <span>{m.author?.name ?? '—'}</span>
                  <span>{fmtRuDateTimeYekb(m.createdAt)}</span>
                </div>
                <div className={s.subBlock}>{m.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

async function DiscussionPostModal({ postId }: { postId: string }) {
  const post = await prisma.discussionPost.findUnique({
    where: { id: postId },
    select: {
      id: true, createdAt: true, updatedAt: true, text: true, pinned: true,
      author: { select: { id: true, name: true } },
      comments: {
        select: { id: true, createdAt: true, text: true, author: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!post) return null;

  return (
    <div className={s.modalBackdrop}>
      <div className={s.modal}>
        <div className={s.modalHead}>
          <div className={s.modalTitle}>Пост от {post.author?.name ?? '—'}</div>
          <Link href={`?`} className={s.modalClose} aria-label="Закрыть">×</Link>
        </div>

        <div className={s.modalMeta}>
          <span>создан: {fmtRuDateTimeYekb(post.createdAt)}</span>
          <span>изменён: {fmtRuDateTimeYekb(post.updatedAt)}</span>
          {post.pinned ? <span className={s.badgeMuted}>закреплено</span> : null}
        </div>

        <div className={s.modalSection}>{post.text}</div>

        <div className={s.modalSection}>
          <div className={s.blockSubhead}>Комментарии</div>
          <div className={`${s.list} ${post.comments.length > 8 ? s.scroll : ''}`}>
            {post.comments.length === 0 ? <div className={s.empty}>Комментариев нет</div> : post.comments.map(c => (
              <div key={c.id} className={s.card}>
                <div className={s.cardRow}>
                  <span>{c.author?.name ?? '—'}</span>
                  <span>{fmtRuDateTimeYekb(c.createdAt)}</span>
                </div>
                <div className={s.subBlock}>{c.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Главный компонент обзора (личный кабинет) ===== */

export default async function TeacherOverview({
  userId,
  viewerId,
  viewerRole,
  searchParams,
}: {
  userId: string;
  viewerId: string;
  viewerRole: Role | null | undefined;
  searchParams: SearchParams;
}) {
  // доступ: владелец страницы или расширенные права
  const canView = viewerId === userId || hasFullAccess(viewerRole);
  if (!canView) return null;

  const sp = await searchParams;
  const taskParam     = typeof sp.task === 'string' ? sp.task : undefined;
  const assigneeParam = typeof sp.assignee === 'string' ? sp.assignee : undefined;
  const noteParam     = typeof sp.note === 'string' ? sp.note : undefined;
  const reqParam      = typeof sp.req === 'string' ? sp.req : undefined;
  const postParam     = typeof sp.post === 'string' ? sp.post : undefined;

  // Базовые данные пользователя
  const userPromise = prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, username: true, email: true, phone: true, role: true,
      avatarUrl: true, subjects: true, methodicalGroups: true, lastSeen: true,
    },
  });

  // Назначенные мне (скрытые задачи исключаем)
  const assigneePromise = prisma.taskAssignee.findMany({
    where: { userId, task: { hidden: false } },
    select: {
      id: true, status: true, assignedAt: true, completedAt: true, submittedAt: true, reviewedAt: true,
      task: {
        select: {
          id: true, number: true, title: true, dueDate: true, priority: true,
          createdByName: true, createdBy: { select: { id: true, name: true } },
        },
      },
      submissions: {
        select: { id: true, createdAt: true, open: true, reviewedAt: true, reviewerComment: true },
        orderBy: { createdAt: 'desc' }, take: 3,
      },
    },
    orderBy: [{ status: 'asc' }, { task: { dueDate: 'asc' } }],
    take: 200,
  });

  // Задачи, которые я создал (без hidden)
  const createdTasksPromise = prisma.task.findMany({
    where: { createdById: userId, hidden: false },
    select: {
      id: true, number: true, title: true, dueDate: true, priority: true,
      createdAt: true, reviewRequired: true,
      _count: { select: { assignees: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  // На проверке (я рецензент), исключаем скрытые
  const toReviewPromise = prisma.submission.findMany({
    where: { reviewedById: userId, open: true, assignee: { task: { hidden: false } } },
    select: {
      id: true, createdAt: true, reviewerComment: true,
      assignee: {
        select: {
          id: true,
          user: { select: { id: true, name: true } },
          task: { select: { id: true, number: true, title: true, dueDate: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  // Предметы
  const subjectsPromise = prisma.subjectMember.findMany({
    where: { userId },
    select: { subject: { select: { id: true, name: true } } },
    orderBy: { subject: { name: 'asc' } },
  });

  // Заметки (за последнюю неделю вперёд)
  const notesPromise = prisma.note.findMany({
    where: { userId, at: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7) } },
    select: { id: true, at: true, allDay: true, title: true, text: true },
    orderBy: { at: 'asc' }, take: 200,
  });

  // Заявки
  const [requestsAuthoredPromise, requestsProcessedPromise] = [
    prisma.request.findMany({
      where: { authorId: userId },
      select: { id: true, createdAt: true, status: true, title: true, target: true, lastMessageAt: true },
      orderBy: { lastMessageAt: 'desc' }, take: 200,
    }),
    prisma.request.findMany({
      where: { processedById: userId },
      select: { id: true, createdAt: true, status: true, title: true, target: true, lastMessageAt: true },
      orderBy: { lastMessageAt: 'desc' }, take: 200,
    }),
  ];

  // Обсуждения
  const [postsPromise, commentsPromise] = [
    prisma.discussionPost.findMany({
      where: { authorId: userId },
      select: { id: true, createdAt: true, text: true, pinned: true },
      orderBy: { createdAt: 'desc' }, take: 100,
    }),
    prisma.discussionComment.findMany({
      where: { authorId: userId },
      select: { id: true, createdAt: true, text: true, postId: true },
      orderBy: { createdAt: 'desc' }, take: 100,
    }),
  ];

  const [
    user,
    assignees,
    createdTasks,
    toReview,
    subjects,
    notes,
    requestsAuthored,
    requestsProcessed,
    posts,
    comments,
  ] = await Promise.all([
    userPromise,
    assigneePromise,
    createdTasksPromise,
    toReviewPromise,
    subjectsPromise,
    notesPromise,
    requestsAuthoredPromise,
    requestsProcessedPromise,
    postsPromise,
    commentsPromise,
  ]);

  if (!user) return null;

  const roleShow = (() => {
    const rl = roleLabel(user.role);
    return rl && rl !== '—' ? rl : null;
  })();

  const stat = {
    tasksInProgress: assignees.filter(a => a.status === 'in_progress').length,
    tasksSubmitted:  assignees.filter(a => a.status === 'submitted').length,
    tasksDone:       assignees.filter(a => a.status === 'done').length,
    toReviewCount:   toReview.length,
    createdTasksCount: createdTasks.length,
    requestsAuthoredCount: requestsAuthored.length,
    requestsProcessedCount: requestsProcessed.length,
    subjectsCount: subjects.length,
    notesCount: notes.length,
  };

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.avatarWrap}>
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt={user.name ?? 'Пользователь'} className={s.avatar} />
          ) : (
            <div className={s.avatarFallback}>{(user.name ?? '?').slice(0, 1)}</div>
          )}
        </div>
        <div className={s.headText}>
          <h1 className={s.title}>{user.name}</h1>
          <div className={s.metaRow}>
            {roleShow ? <span className={s.badge}>{roleShow}</span> : null}
            {user.email ? <span className={s.metaItem}>{user.email}</span> : null}
            {user.phone ? <span className={s.metaItem}>{user.phone}</span> : null}
            {user.lastSeen ? <span className={s.metaItem}>в сети: {fmtRuDateTimeYekb(user.lastSeen)}</span> : null}
          </div>
          <div className={s.counters}>
            <span>назначено: {stat.tasksInProgress}</span>
            <span>сдано: {stat.tasksSubmitted}</span>
            <span>выполнено: {stat.tasksDone}</span>
            <span>на проверке: {stat.toReviewCount}</span>
            <span>мои задачи: {stat.createdTasksCount}</span>
          </div>
        </div>
      </header>

      {/* Назначенные мне */}
      <section className={s.block}>
        <h2 className={s.blockTitle}>Задачи, назначенные мне</h2>
        <div className={`${s.list} ${assignees.length > 8 ? s.scroll : ''}`}>
          {assignees.map(a => (
            <Link key={a.id} href={`?assignee=${a.id}`} className={s.cardLink} prefetch={false}>
              <div className={s.card}>
                <div className={s.cardRow}>
                  <span className={s.cardNumber}>#{a.task.number}</span>
                  <span className={s.status}>{taskAssigneeStatusLabel(a.status)}</span>
                </div>
                <div className={s.cardTitle}>{a.task.title}</div>
                <div className={s.cardMeta}>
                  <span>срок: {fmtRuDateTimeYekb(a.task.dueDate)}</span>
                  <span>приоритет: {a.task.priority}</span>
                  {a.task.createdByName ? <span>назначил: {a.task.createdByName}</span> : null}
                </div>
                {a.submissions.length > 0 ? (
                  <div className={s.subBlock}>
                    Последние отправки: {a.submissions.map(su => fmtRuDateTimeYekb(su.createdAt)).join(', ')}
                  </div>
                ) : null}
              </div>
            </Link>
          ))}
          {assignees.length === 0 ? <div className={s.empty}>Назначений нет</div> : null}
        </div>
      </section>

      {/* Мои задачи */}
      <section className={s.block}>
        <h2 className={s.blockTitle}>Задачи, которые я создал</h2>
        <div className={`${s.list} ${createdTasks.length > 8 ? s.scroll : ''}`}>
          {createdTasks.map(t => (
            <Link key={t.id} href={`?task=${t.id}`} className={s.cardLink} prefetch={false}>
              <div className={s.card}>
                <div className={s.cardRow}>
                  <span className={s.cardNumber}>#{t.number}</span>
                  {t.reviewRequired ? <span className={s.badgeMuted}>на проверке</span> : null}
                </div>
                <div className={s.cardTitle}>{t.title}</div>
                <div className={s.cardMeta}>
                  <span>создано: {fmtRuDateTimeYekb(t.createdAt)}</span>
                  <span>срок: {fmtRuDateTimeYekb(t.dueDate)}</span>
                  <span>приоритет: {t.priority}</span>
                  <span>исполнители: {t._count.assignees}</span>
                </div>
              </div>
            </Link>
          ))}
          {createdTasks.length === 0 ? <div className={s.empty}>Пока нет созданных задач</div> : null}
        </div>
      </section>

      {/* На проверке */}
      <section className={s.block}>
        <h2 className={s.blockTitle}>На проверке</h2>
        <div className={`${s.list} ${toReview.length > 8 ? s.scroll : ''}`}>
          {toReview.map(r => (
            <div key={r.id} className={s.card}>
              <div className={s.cardTitle}>#{r.assignee.task.number} {r.assignee.task.title}</div>
              <div className={s.cardMeta}>
                <span>участник: {r.assignee.user.name}</span>
                <span>получено: {fmtRuDateTimeYekb(r.createdAt)}</span>
                <span>дедлайн: {fmtRuDateTimeYekb(r.assignee.task.dueDate)}</span>
              </div>
              {r.reviewerComment ? <div className={s.subBlock}>мои пометки: {r.reviewerComment}</div> : null}
            </div>
          ))}
          {toReview.length === 0 ? <div className={s.empty}>Открытых проверок нет</div> : null}
        </div>
      </section>

      {/* Предметы */}
      <section className={s.block}>
        <h2 className={s.blockTitle}>Предметы</h2>
        <div className={s.tags}>
          {subjects.map(sm => (<span key={sm.subject.id} className={s.badge}>{sm.subject.name}</span>))}
          {subjects.length === 0 ? <div className={s.empty}>Нет привязок к предметам</div> : null}
        </div>
      </section>

      {/* Заметки */}
      <section className={s.block}>
        <h2 className={s.blockTitle}>Ближайшие заметки</h2>
        <div className={`${s.list} ${notes.length > 8 ? s.scroll : ''}`}>
          {notes.map(n => (
            <Link key={n.id} href={`?note=${n.id}`} className={s.cardLink} prefetch={false}>
              <div className={s.card}>
                <div className={s.cardTitle}>{n.title ?? 'Заметка'}</div>
                <div className={s.cardMeta}>
                  <span>{n.allDay ? 'весь день' : fmtRuDateTimeYekb(n.at)}</span>
                </div>
                <div className={s.subBlock}>{n.text}</div>
              </div>
            </Link>
          ))}
          {notes.length === 0 ? <div className={s.empty}>Ближайших заметок нет</div> : null}
        </div>
      </section>

      {/* Заявки (автор) */}
      <section className={s.block}>
        <h2 className={s.blockTitle}>Мои заявки</h2>
        <div className={`${s.list} ${requestsAuthored.length > 8 ? s.scroll : ''}`}>
          {requestsAuthored.map(r => (
            <Link key={r.id} href={`?req=${r.id}`} className={s.cardLink} prefetch={false}>
              <div className={s.card}>
                <div className={s.cardTitle}>{r.title}</div>
                <div className={s.cardMeta}>
                  <span>статус: {requestStatusLabel(r.status)}</span>
                  <span>адресат: {r.target}</span>
                  <span>активность: {fmtRuDateTimeYekb(r.lastMessageAt)}</span>
                </div>
              </div>
            </Link>
          ))}
          {requestsAuthored.length === 0 ? <div className={s.empty}>Нет авторских заявок</div> : null}
        </div>
      </section>

      {/* Заявки (обрабатываю) */}
      <section className={s.block}>
        <h2 className={s.blockTitle}>Заявки, которые я обрабатываю</h2>
        <div className={`${s.list} ${requestsProcessed.length > 8 ? s.scroll : ''}`}>
          {requestsProcessed.map(r => (
            <Link key={r.id} href={`?req=${r.id}`} className={s.cardLink} prefetch={false}>
              <div className={s.card}>
                <div className={s.cardTitle}>{r.title}</div>
                <div className={s.cardMeta}>
                  <span>статус: {requestStatusLabel(r.status)}</span>
                  <span>адресат: {r.target}</span>
                  <span>активность: {fmtRuDateTimeYekb(r.lastMessageAt)}</span>
                </div>
              </div>
            </Link>
          ))}
          {requestsProcessed.length === 0 ? <div className={s.empty}>Нет заявок в работе</div> : null}
        </div>
      </section>

      {/* Обсуждения */}
      <section className={s.block}>
        <h2 className={s.blockTitle}>Обсуждения</h2>
        <div className={s.columns}>
          <div>
            <div className={s.blockSubhead}>мои посты</div>
            <div className={`${s.list} ${posts.length > 8 ? s.scroll : ''}`}>
              {posts.map(p => (
                <Link key={p.id} href={`?post=${p.id}`} className={s.cardLink} prefetch={false}>
                  <div className={s.card}>
                    <div className={s.cardMeta}>
                      <span>{fmtRuDateTimeYekb(p.createdAt)}</span>
                      {p.pinned ? <span className={s.badgeMuted}>закреплено</span> : null}
                    </div>
                    <div className={s.subBlock}>{p.text}</div>
                  </div>
                </Link>
              ))}
              {posts.length === 0 ? <div className={s.empty}>Нет постов</div> : null}
            </div>
          </div>
          <div>
            <div className={s.blockSubhead}>мои комментарии</div>
            <div className={`${s.list} ${comments.length > 8 ? s.scroll : ''}`}>
              {comments.map(c => (
                <div key={c.id} className={s.card}>
                  <div className={s.cardMeta}>
                    <span>{fmtRuDateTimeYekb(c.createdAt)}</span>
                    <span>post: {c.postId.slice(0, 8)}…</span>
                  </div>
                  <div className={s.subBlock}>{c.text}</div>
                </div>
              ))}
              {comments.length === 0 ? <div className={s.empty}>Нет комментариев</div> : null}
            </div>
          </div>
        </div>
      </section>

      {/* Рендер модалок по query */}
      {taskParam     ? <TaskDetailsModal     taskId={taskParam} />     : null}
      {assigneeParam ? <AssigneeDetailsModal assigneeId={assigneeParam} /> : null}
      {noteParam     ? <NoteModal            noteId={noteParam} />     : null}
      {reqParam      ? <RequestModal         requestId={reqParam} />   : null}
      {postParam     ? <DiscussionPostModal  postId={postParam} />     : null}
    </div>
  );
}

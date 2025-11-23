import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks } from '@/lib/roles';
import type { Prisma } from '@prisma/client';
import { deleteTaskAction, purgeHiddenTasksAction } from './actions';
import Badge from './Badge';
import s from './inboxtasks.modal.module.css';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function parseStr(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  const t = (s ?? '').trim();
  return t || undefined;
}

function parseIntSafe(
  sp: Record<string, string | string[] | undefined>,
  key: string,
  def: number,
  min: number,
  max: number
) {
  const v = parseStr(sp, key);
  const n = v ? Number(v) : NaN;
  if (Number.isFinite(n)) return Math.max(min, Math.min(max, Math.trunc(n)));
  return def;
}

function pickFromSet<T extends string>(
  sp: Record<string, string | string[] | undefined>,
  key: string,
  allowed: readonly T[]
): T | undefined {
  const v = parseStr(sp, key) as T | undefined;
  return v && allowed.includes(v) ? v : undefined;
}

function fmtRuDateYekb(input: string | Date) {
  const dt = typeof input === 'string' ? new Date(input) : input;
  const p = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
    .formatToParts(dt)
    .reduce<Record<string, string>>((a, x) => {
      a[x.type] = x.value;
      return a;
    }, {});
  return `${p.day} ${p.month} ${p.year}`;
}

function statusRu(s: string) {
  return s === 'in_progress'
    ? 'в работе'
    : s === 'submitted'
    ? 'на проверке'
    : s === 'done'
    ? 'принято'
    : s === 'rejected'
    ? 'возвращено'
    : s;
}

function buildSearchOr(qRaw: string | undefined): Prisma.TaskWhereInput[] {
  if (!qRaw) return [];
  const q = qRaw.trim();
  if (!q) return [];
  if (q.startsWith('#')) {
    const num = q.slice(1).trim();
    if (/^\d{1,9}$/.test(num)) return [{ number: Number(num) }];
  }
  if (q.startsWith('@')) {
    const who = q.slice(1).trim();
    if (who)
      return [
        {
          assignees: {
            some: { user: { name: { contains: who, mode: 'insensitive' } } },
          },
        },
      ];
  }
  if (q.toLowerCase().startsWith('file:')) {
    const part = q.slice(5).trim();
    if (part)
      return [
        {
          attachments: {
            some: {
              attachment: {
                originalName: { contains: part, mode: 'insensitive' },
              },
            },
          },
        },
      ];
  }
  const isNum = /^\d{1,9}$/.test(q);
  const or: Prisma.TaskWhereInput[] = [
    { title: { contains: q, mode: 'insensitive' } },
    { description: { contains: q, mode: 'insensitive' } },
    {
      assignees: {
        some: { user: { name: { contains: q, mode: 'insensitive' } } },
      },
    },
    {
      assignees: {
        some: {
          submissions: {
            some: {
              reviewerComment: { contains: q, mode: 'insensitive' },
              open: false,
            },
          },
        },
      },
    },
    {
      attachments: {
        some: {
          attachment: {
            originalName: { contains: q, mode: 'insensitive' },
          },
        },
      },
    },
  ];
  if (isNum) or.unshift({ number: Number(q) });
  return or;
}

type StatusFilter = 'in_progress' | 'submitted' | 'done' | 'rejected';
type ReviewFilter = 'has' | 'none';
type HiddenMode = 'all' | 'only' | 'active';

function dayBoundsYekb(dateIso: string): { gte: Date; lt: Date } {
  const d = new Date(dateIso);
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { gte: start, lt: end };
}

function buildWhere(params: {
  q?: string;
  meId: string;
  status?: StatusFilter;
  date?: string;
  review?: ReviewFilter;
  hiddenMode: HiddenMode;
}): Prisma.TaskWhereInput {
  const conds: Prisma.TaskWhereInput[] = [{ createdById: params.meId }];
  if (params.hiddenMode === 'active') conds.push({ hidden: false });
  if (params.hiddenMode === 'only') conds.push({ hidden: true });
  const or = buildSearchOr(params.q);
  if (or.length) conds.push({ OR: or });
  if (params.status) conds.push({ assignees: { some: { status: params.status } } });
  if (params.date) {
    const b = dayBoundsYekb(params.date);
    conds.push({ dueDate: { gte: b.gte, lt: b.lt } });
  }
  if (params.review === 'has')
    conds.push({ assignees: { some: { reviewedAt: { not: null } } } });
  if (params.review === 'none')
    conds.push({
      NOT: { assignees: { some: { reviewedAt: { not: null } } } },
    });
  return { AND: conds };
}

function isOverdue(due: Date | string): boolean {
  const d = typeof due === 'string' ? new Date(due) : due;
  return d.getTime() < Date.now();
}

function buildCurrentUrl(basePath: string, args: {
  q?: string;
  status?: StatusFilter;
  review?: ReviewFilter;
  date?: string;
  hiddenMode: HiddenMode;
  take: number;
  page: number;
}) {
  const qs = new URLSearchParams();
  qs.set('tab', 'byme');
  qs.set('modal', 'search-by-me');
  if (args.q) qs.set('q', args.q);
  if (args.status) qs.set('status', args.status);
  if (args.review) qs.set('review', args.review);
  if (args.date) qs.set('date', args.date);
  qs.set('hidden', args.hiddenMode);
  qs.set('take', String(args.take));
  qs.set('page', String(args.page));
  return `${basePath}?${qs.toString()}`;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SearchByMeModal({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const session = await auth();
  const meId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);

  if (!meId || !canCreateTasks(role)) {
    return (
      <div className={s.overlay}>
        <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="title">
          <header className={s.head}>
            <h2 id="title" className={s.title}>Доступ ограничен</h2>
            <a href="/inboxtasks" className={s.closeBtn} aria-label="Закрыть">Закрыть</a>
          </header>
          <div className={s.body}>
            <p>У вас нет прав для просмотра задач, назначенных вами.</p>
          </div>
        </div>
      </div>
    );
  }

  const q = parseStr(sp, 'q');
  const status = pickFromSet(sp, 'status', ['in_progress', 'submitted', 'done', 'rejected'] as const);
  const review = pickFromSet(sp, 'review', ['has', 'none'] as const);
  const date = parseStr(sp, 'date');
  const hiddenMode = pickFromSet(sp, 'hidden', ['all', 'only', 'active'] as const) ?? 'all';
  const purged = parseStr(sp, 'purged');
  const notice = parseStr(sp, 'notice');
  const errorMsg = 'error' in sp ? (Array.isArray(sp.error) ? sp.error[0] : sp.error) : undefined;

  const take = parseIntSafe(sp, 'take', 20, 10, 50);
  const page = parseIntSafe(sp, 'page', 1, 1, 10_000);
  const skip = (page - 1) * take;

  const where = buildWhere({ q, meId, status, date, review, hiddenMode });

  const [tasks, total, overdueCount, submittedCount, doneCount] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        assignees: {
          include: {
            user: { select: { name: true } },
            submissions: {
              where: { open: false },
              take: 1,
              orderBy: { reviewedAt: 'desc' },
            },
          },
        },
        attachments: { include: { attachment: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
    prisma.task.count({ where }),
    prisma.task.count({
      where: {
        AND: [
          { createdById: meId },
          { hidden: false },
          { dueDate: { lt: new Date() } },
        ],
      },
    }),
    prisma.task.count({
      where: {
        AND: [
          { createdById: meId },
          { hidden: false },
          { assignees: { some: { status: 'submitted' } } },
        ],
      },
    }),
    prisma.task.count({
      where: {
        AND: [
          { createdById: meId },
          { hidden: false },
          { assignees: { some: { status: 'done' } } },
        ],
      },
    }),
  ]);

  const firstShown = total === 0 ? 0 : skip + 1;
  const lastShown = Math.min(skip + tasks.length, total);
  const totalPages = Math.max(1, Math.ceil(total / take));

  const basePath = '/inboxtasks';
  const currentUrl = buildCurrentUrl(basePath, { q, status, review, date, hiddenMode, take, page });

  return (
    <div className={s.overlay}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="title">
        <header className={s.head}>
          <h2 id="title" className={s.title}>Назначенные мной — поиск</h2>
          <a
            href="/inboxtasks?tab=byme"
            className={s.closeBtn}
            aria-label="Закрыть"
          >
            Закрыть
          </a>
        </header>

        {errorMsg ? <div className={s.alert} role="alert">{errorMsg}</div> : null}
        {notice ? <div className={s.alert} role="status">{notice}</div> : null}
        {purged ? (
          <div className={s.alert} role="status">
            Скрытые задачи очищены: удалено {Number(purged)}.
          </div>
        ) : null}

        <form method="get" className={s.toolbar} action={basePath}>
          <input type="hidden" name="tab" value="byme" />
          <input type="hidden" name="modal" value="search-by-me" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Поиск: #номер, @исполнитель, file:имя, текст"
            className={s.input}
            autoFocus
          />
          <select
            name="status"
            defaultValue={status ?? ''}
            className={s.select}
            aria-label="Статус"
          >
            <option value="">Статус</option>
            <option value="in_progress">в работе</option>
            <option value="submitted">на проверке</option>
            <option value="done">принято</option>
            <option value="rejected">возвращено</option>
          </select>
          <select
            name="review"
            defaultValue={review ?? ''}
            className={s.select}
            aria-label="Проверка"
          >
            <option value="">Проверка</option>
            <option value="has">есть</option>
            <option value="none">нет</option>
          </select>
          <input
            type="date"
            name="date"
            defaultValue={date}
            className={s.date}
            aria-label="за дату"
          />
          <select
            name="hidden"
            defaultValue={hiddenMode}
            className={s.select}
            aria-label="Скрытые"
          >
            <option value="all">Все</option>
            <option value="active">Активные</option>
            <option value="only">Скрытые</option>
          </select>
          <select
            name="take"
            defaultValue={String(take)}
            className={s.select}
            aria-label="На странице"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
          <input type="hidden" name="page" value="1" />
          <button className={s.btnPrimary}>Найти</button>
        </form>

        <div className={s.resetRow}>
          <a
            href={`${basePath}?tab=byme&modal=search-by-me`}
            className={s.btnGhost}
            role="button"
          >
            Сбросить
          </a>
        </div>

        <div className={s.summary}>
          <span className={s.counter}>
            Найдено: {total} • Показаны {firstShown}–{lastShown}
          </span>
          <div className={s.badges}>
            <Badge kind="muted">На проверке: {submittedCount}</Badge>
            <Badge kind="muted">Принято: {doneCount}</Badge>
            <Badge kind="muted">Просрочено: {overdueCount}</Badge>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className={s.empty}>
            Ничего не найдено. Очистите фильтры или выберите другую дату.
          </div>
        ) : (
          <section
            className={`${s.results} ${
              tasks.length > 7 ? s.resultsScroll : ''
            }`}
          >
            {tasks.map((t) => {
              const overdue = isOverdue(t.dueDate as any);
              const attachmentsCount = t.attachments.length;
              const checksCount = t.assignees.reduce(
                (n, a) => n + (a.reviewedAt ? 1 : 0),
                0,
              );

              return (
                <article
                  key={t.id}
                  className={`${s.card} ${overdue ? s.cardOverdue : ''}`}
                  data-urgent={t.priority === 'high' ? 'true' : 'false'}
                >
                  <header className={s.cardHead}>
                    <div className={s.cardTitle}>
                      <b>
                        №{t.number} {t.title}
                      </b>
                      {t.priority === 'high' ? (
                        <Badge kind="urgent">приоритет: high</Badge>
                      ) : (
                        <Badge kind="muted">приоритет: normal</Badge>
                      )}
                      {t.hidden ? (
                        <Badge kind="redo" title="Скрыта мягким удалением">
                          скрыта
                        </Badge>
                      ) : null}
                    </div>
                    <div className={s.meta}>
                      <span
                        className={overdue ? s.dueOver : s.dueOk}
                      >
                        до {fmtRuDateYekb(t.dueDate as any)}
                      </span>
                      <span className={s.metaDot}>•</span>
                      <span>вложений: {attachmentsCount}</span>
                      <span className={s.metaDot}>•</span>
                      <span>проверок: {checksCount}</span>
                    </div>
                  </header>

                  <details className={s.details}>
                    <summary>Подробнее</summary>

                    <div className={s.section}>
                      <h4 className={s.sectionTitle}>Описание</h4>
                      <div className={s.description}>{t.description}</div>
                    </div>

                    <div className={s.section}>
                      <h4 className={s.sectionTitle}>Исполнители</h4>
                      <ul className={s.assignees}>
                        {t.assignees.map((a) => (
                          <li
                            key={`${t.id}_${a.id}`}
                            className={s.assigneeLine}
                          >
                            <span className={s.assigneeName}>
                              {a.user?.name ?? '—'}
                            </span>
                            <Badge kind="muted">
                              {statusRu(a.status as string)}
                            </Badge>
                            {a.reviewedAt ? (
                              <span className={s.assigneeMeta}>
                                обновлено {fmtRuDateYekb(a.reviewedAt)}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className={s.sectionActions}>
                      <form
                        action={deleteTaskAction}
                        className={s.inlineForm}
                      >
                        <input type="hidden" name="taskId" value={t.id} />
                        <input
                          type="hidden"
                          name="returnTo"
                          value={currentUrl}
                        />
                        <button className={s.btnSmDanger}>
                          Удалить
                        </button>
                      </form>
                    </div>
                  </details>
                </article>
              );
            })}
          </section>
        )}

        <footer className={s.pager}>
          <form method="get" className={s.pagerForm} action={basePath}>
            <input type="hidden" name="tab" value="byme" />
            <input type="hidden" name="modal" value="search-by-me" />
            {q ? <input type="hidden" name="q" value={q} /> : null}
            {status ? (
              <input type="hidden" name="status" value={status} />
            ) : null}
            {review ? (
              <input type="hidden" name="review" value={review} />
            ) : null}
            {date ? (
              <input type="hidden" name="date" value={date} />
            ) : null}
            <input type="hidden" name="hidden" value={hiddenMode} />
            <input
              type="hidden"
              name="take"
              value={String(take)}
            />
            <button
              className={s.btnGhost}
              name="page"
              value={String(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              Назад
            </button>
            <span className={s.pageInfo}>
              стр. {page} из {totalPages}
            </span>
            <button
              className={s.btnGhost}
              name="page"
              value={String(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
            >
              Вперёд
            </button>
          </form>

          {role === 'deputy_plus' ? (
            <form
              action={purgeHiddenTasksAction}
              className={s.inlineForm}
              title="Удалить из базы все ранее скрытые задачи"
            >
              <input
                type="hidden"
                name="returnTo"
                value={currentUrl}
              />
              <button className={s.btnDanger}>
                Очистить скрытые
              </button>
            </form>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

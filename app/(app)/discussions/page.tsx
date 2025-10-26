import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { canPinDiscussions, canModerateDiscussions, normalizeRole } from '@/lib/roles';
import {
  createDiscussionPostAction,
  toggleReactionAction,
  deleteDiscussionPostAction,
} from './actions';
import MentionInput from './MentionInput';
import './discussions.css';
import LikeModal from './LikeModal';

type Search = Promise<Record<string, string | string[] | undefined>>;

function parseIntSafe(v: string | undefined, def = 1) {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}
function fmtEkaterinburg(d: Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Yekaterinburg',
  }).format(d);
}
function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;/g,').replace(/>/g, '&gt;').replace(/</g, '&lt;');
}
function renderWithMentions(raw: string): string {
  const escaped = escapeHtml(raw).replace(/\r\n/g, '\n');
  const withMentions = escaped.replace(
    /(^|[\s(])@([a-zA-Z0-9._-]{2,32})\b/g,
    (_m, p1, uname) => {
      if (uname === 'everyone') {
        return `${p1}<span class="disc-mention disc-mention--all">всему коллективу</span>`;
      }
      return `${p1}<span class="disc-mention">@${uname}</span>`;
    }
  );
  return withMentions.replace(/\n/g, '<br/>');
}

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Search }) {
  noStore();

  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="disc-wrap">
        <div className="disc-card">
          <h1 className="disc-title">Объявления и обсуждения</h1>
          <p className="disc-muted">Доступно только авторизованным пользователям.</p>
        </div>
      </div>
    );
  }

  const role = normalizeRole(session.user.role);
  const mayPin = canPinDiscussions(role);
  const mayModerate = canModerateDiscussions(role);

  const params = await searchParams;
  const tab = (Array.isArray(params.t) ? params.t[0] : (params.t as string)) || 'all';
  const isMentionsTab = tab === 'm';

  const page = parseIntSafe(Array.isArray(params.p) ? params.p[0] : (params.p as string));
  const pageSize = 20;
  const skip = (page - 1) * pageSize;

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true },
  });
  const username = me?.username || undefined;

  const needles: string[] = ['@everyone'];
  if (username) needles.push(`@${username}`);
  const textOr = needles.map((n) => ({ text: { contains: n } }));

  let items: {
    id: string;
    text: string;
    pinned: boolean;
    createdAt: Date | string;
    authorId: string;
    author: { name: string | null; username: string | null } | null;
  }[] = [];
  let total = 0;

  if (isMentionsTab) {
    const [postsWithAny, commentsWithAny] = await Promise.all([
      prisma.discussionPost.findMany({ where: { OR: textOr }, select: { id: true } }),
      prisma.discussionComment.findMany({ where: { OR: textOr }, select: { postId: true } }),
    ]);
    const idsMentioned = Array.from(
      new Set<string>([...postsWithAny.map((p) => p.id), ...commentsWithAny.map((c) => c.postId)])
    );

    total = idsMentioned.length;

    items = await prisma.discussionPost.findMany({
      where: { id: { in: idsMentioned } },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: pageSize,
      select: {
        id: true,
        text: true,
        pinned: true,
        createdAt: true,
        authorId: true,
        author: { select: { name: true, username: true } },
      },
    });
  } else {
    const [itemsAll, totalAll] = await Promise.all([
      prisma.discussionPost.findMany({
        skip,
        take: pageSize,
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          text: true,
          pinned: true,
          createdAt: true,
          authorId: true,
          author: { select: { name: true, username: true } },
        },
      }),
      prisma.discussionPost.count(),
    ]);
    items = itemsAll;
    total = totalAll;
  }

  const ids = items.map((p) => p.id);

  const [myLikes, likeGroups, commentGroups] = ids.length
    ? await Promise.all([
        prisma.discussionReaction.findMany({
          where: { userId: session.user.id, postId: { in: ids } },
          select: { postId: true },
        }),
        prisma.discussionReaction.groupBy({
          by: ['postId'],
          where: { postId: { in: ids } },
          _count: { postId: true },
        }),
        prisma.discussionComment.groupBy({
          by: ['postId'],
          where: { postId: { in: ids } },
          _count: { postId: true },
        }),
      ])
    : [[], [], []];

  const likedSet = new Set(myLikes.map((x) => x.postId));
  const likesCount = new Map(likeGroups.map((x) => [x.postId, x._count.postId]));
  const commentsCount = new Map(commentGroups.map((x) => [x.postId, x._count.postId]));

  type LR = {
    postId: string;
    user: { name: string | null; username: string | null } | null;
  };

  const likeRecords: LR[] = ids.length
    ? await prisma.discussionReaction.findMany({
        where: { postId: { in: ids } },
        select: {
          postId: true,
          user: { select: { name: true, username: true } },
        },
      })
    : [];

  const likedUsers = new Map<string, { username: string | null; name: string | null }[]>();
  for (const r of likeRecords) {
    const usersArr = likedUsers.get(r.postId) ?? [];
    usersArr.push({ username: r.user?.username ?? null, name: r.user?.name ?? null });
    likedUsers.set(r.postId, usersArr);
  }

  let mentionedSet = new Set<string>();
  let everyoneSet = new Set<string>();
  if (ids.length) {
    const [postsWithAnyPage, commentsWithAnyPage, postsWithEveryone, commentsWithEveryone] =
      await Promise.all([
        prisma.discussionPost.findMany({
          where: { id: { in: ids }, OR: textOr },
          select: { id: true },
        }),
        prisma.discussionComment.groupBy({
          by: ['postId'],
          where: { postId: { in: ids }, OR: textOr },
          _count: { postId: true },
        }),
        prisma.discussionPost.findMany({
          where: { id: { in: ids }, text: { contains: '@everyone' } },
          select: { id: true },
        }),
        prisma.discussionComment.groupBy({
          by: ['postId'],
          where: { postId: { in: ids }, text: { contains: '@everyone' } },
          _count: { postId: true },
        }),
      ]);

    mentionedSet = new Set<string>([
      ...postsWithAnyPage.map((p) => p.id),
      ...commentsWithAnyPage.map((g) => g.postId),
    ]);
    everyoneSet = new Set<string>([
      ...postsWithEveryone.map((p) => p.id),
      ...commentsWithEveryone.map((g) => g.postId),
    ]);
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="disc-wrap">
      <div className="disc-card">
        <h1 className="disc-title">Пейджер</h1>
        <p className="disc-subtitle">Закреплённые посты всегда наверху.</p>

        <div className="disc-tabs">
          <Link
            href={`/discussions?p=1`}
            className={`disc-tab${!isMentionsTab ? ' disc-tab--active' : ''}`}
          >
            Все посты
          </Link>
          <Link
            href={`/discussions?p=1&t=m`}
            className={`disc-tab${isMentionsTab ? ' disc-tab--active' : ''}`}
            title="Посты, где вас упомянули или посты, которые адресованы всему коллективу"
          >
            Упоминания Вас
          </Link>
        </div>

        <form className="disc-form" action={createDiscussionPostAction}>
          <label className="disc-label">Текст</label>
          <MentionInput
            name="text"
            placeholder="через @ можно упомянуть коллегу или @everyone — всех сразу. Сообщения в ленте ВИДНЫ ВСЕМ!"
            maxLength={8000}
            rows={5}
            className="disc-input disc-textarea"
          />
          <div className="disc-form-row">
            {mayPin ? (
              <label className="disc-checkbox">
                <input type="checkbox" name="pinned" value="1" /> Закрепить
              </label>
            ) : (
              <span className="disc-help">Закреплять может только администрация</span>
            )}
            <button type="submit" className="disc-btn">Опубликовать</button>
          </div>
        </form>
      </div>

      <div className="disc-list">
        {items.map((p) => {
          const isAuthor = p.authorId === session.user.id;
          const canDelete = isAuthor || mayModerate;
          const created = fmtEkaterinburg(new Date(p.createdAt));
          const liked = likedSet.has(p.id);
          const likeCnt = likesCount.get(p.id) ?? 0;
          const commCnt = commentsCount.get(p.id) ?? 0;

          const mentioned = mentionedSet.has(p.id);
          const everyoneMentioned = everyoneSet.has(p.id);

          const people = likedUsers.get(p.id) ?? [];

          return (
            <article
              key={p.id}
              className={
                `disc-post disc-post--link` +
                (p.pinned ? ' disc-post--pinned' : '') +
                (mentioned ? ' disc-post--mentioned' : '')
              }
            >
              <Link
                href={`/discussions/${p.id}`}
                className="disc-post-cover"
                aria-label="Открыть пост"
              />
              <header className="disc-post-head">
                <div className="disc-post-flags">
                  {p.pinned ? <span className="disc-badge">закреплено</span> : null}
                  {everyoneMentioned ? (
                    <span className="disc-badge disc-badge--all" title="Сообщение для всех">
                      всему коллективу
                    </span>
                  ) : null}
                  {mentioned && !everyoneMentioned ? (
                    <span className="disc-badge disc-badge--me" title="Вас упомянули">
                      вас упомянули
                    </span>
                  ) : null}
                  <div className="disc-meta">
                    <span className="disc-author">
                      {p.author?.name ?? 'Без имени'}
                      {p.author?.username ? ` · @${p.author.username}` : ''}
                    </span>
                    <time className="disc-time" dateTime={new Date(p.createdAt).toISOString()}>
                      {created}
                    </time>
                  </div>
                </div>

                <div className="disc-post-actions">
                  <div className="disc-like-wrap">
                    <form action={toggleReactionAction}>
                      <input type="hidden" name="postId" value={p.id} />
                      <button
                        type="submit"
                        className={`disc-like ${liked ? 'disc-like--on' : ''}`}
                        aria-label={liked ? 'Убрать отметку "нравится"' : 'Отметить как "нравится"'}
                        title={liked ? 'Не нравится' : 'Нравится'}
                      >
                        <svg
                          className="disc-like-ic"
                          viewBox="0 0 24 24"
                          width="20"
                          height="20"
                          aria-hidden="true"
                        >
                          <path
                            d="M12.001 5.882c1.528-3.22 6.48-3.585 8.32.062 1.147 2.253.526 4.99-1.57 6.62L12 20l-6.75-7.436c-2.096-1.63-2.717-4.367-1.57-6.62 1.84-3.647 6.792-3.282 8.321-.062z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                    </form>

                    <LikeModal
                      people={people}
                      triggerId={`likes-${p.id}`}
                      label={String(likeCnt)}
                      small
                    />
                  </div>

                  {canDelete ? (
                    <form action={deleteDiscussionPostAction} className="disc-inline-form">
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="disc-btn-danger">Удалить</button>
                    </form>
                  ) : null}
                </div>
              </header>

              <div
                className="disc-text"
                dangerouslySetInnerHTML={{ __html: renderWithMentions(p.text) }}
              />

              <footer className="disc-post-foot">
                <Link
                  href={`/discussions/${p.id}#comments`}
                  className="disc-comments-btn"
                  aria-label={`Открыть комментарии (${commCnt})`}
                >
                  Комментариев: {commCnt}
                </Link>
                {/* Кнопку "Подробнее" убрал для визуальной чистоты */}
                <span />
              </footer>
            </article>
          );
        })}

        {items.length === 0 ? (
          <div className="disc-empty">Пока ничего нет. Будьте первыми.</div>
        ) : null}
      </div>

      <nav className="disc-pager">
        <Pager page={page} pages={pages} tab={isMentionsTab ? 'm' : 'all'} />
      </nav>
    </div>
  );
}

function Pager({ page, pages, tab }: { page: number; pages: number; tab: 'all' | 'm' }) {
  const qs = tab === 'm' ? '&t=m' : '';
  const prev = page > 1 ? page - 1 : null;
  const next = page < pages ? page + 1 : null;
  return (
    <div className="disc-pager-row">
      {prev ? (
        <Link className="disc-btn-lite" href={`/discussions?p=${prev}${qs}`}>
          Назад
        </Link>
      ) : (
        <span />
      )}
      <span className="disc-pager-info">
        {page} из {pages}
      </span>
      {next ? (
        <Link className="disc-btn-lite" href={`/discussions?p=${next}${qs}`}>
          Вперёд
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}

// app/(app)/discussions/[id]/page.tsx
import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { notFound, redirect as nextRedirect } from 'next/navigation';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canModerateDiscussions } from '@/lib/roles';
import {
  toggleReactionAction,
  deleteDiscussionPostAction,
  createDiscussionCommentAction,
  deleteDiscussionCommentAction,
} from '../actions';
import MentionInput from '../MentionInput';
import '../discussions.css';

type Params = Promise<{ id: string }>;

function fmtEkaterinburg(d: Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Yekaterinburg',
  }).format(d);
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderWithMentions(raw: string): string {
  const escaped = escapeHtml(raw).replace(/\r\n/g, '\n');
  const withMentions = escaped.replace(
    /(^|[\s(])@([a-zA-Z0-9._-]{2,32})\b/g,
    (_m, p1, uname) => `${p1}<span class="disc-mention">@${uname}</span>`,
  );
  return withMentions.replace(/\n/g, '<br/>');
}

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Params }) {
  noStore();

  const session = await auth();
  if (!session?.user?.id) nextRedirect('/');

  const { id } = await params;

  const [post, comments, likesCount, liked] = await Promise.all([
    prisma.discussionPost.findUnique({
      where: { id },
      select: {
        id: true,
        text: true,
        pinned: true,
        createdAt: true,
        authorId: true,
        author: { select: { name: true, username: true } },
      },
    }),
    prisma.discussionComment.findMany({
      where: { postId: id },
      orderBy: { createdAt: 'desc' }, // новые сверху
      select: {
        id: true,
        text: true,
        createdAt: true,
        authorId: true,
        author: { select: { name: true, username: true } },
      },
    }),
    prisma.discussionReaction.count({ where: { postId: id } }),
    prisma.discussionReaction.findUnique({
      where: { postId_userId: { postId: id, userId: session.user.id } },
      select: { postId: true },
    }),
  ]);

  if (!post) notFound();

  const role = normalizeRole(session.user.role);
  const isAuthor = post.authorId === session.user.id;
  const canDeletePost = isAuthor || canModerateDiscussions(role);

  const created = fmtEkaterinburg(new Date(post.createdAt));

  return (
    <div className="disc-wrap">
      <div className="disc-card">
        <div className="disc-breadcrumbs">
          <Link href="/discussions" className="disc-link">← к ленте</Link>
        </div>

        <article className={`disc-post${post.pinned ? ' disc-post--pinned' : ''}`}>
          <header className="disc-post-head">
            <div className="disc-post-flags">
              {post.pinned ? <span className="disc-badge">закреплено</span> : null}
              <div className="disc-meta">
                <span className="disc-author">
                  {post.author?.name ?? 'Без имени'}
                  {post.author?.username ? ` · @${post.author.username}` : ''}
                </span>
                <time className="disc-time" dateTime={new Date(post.createdAt).toISOString()}>
                  {created}
                </time>
              </div>
            </div>
            <div className="disc-post-actions">
              <form action={toggleReactionAction}>
                <input type="hidden" name="postId" value={post.id} />
                <button
                  type="submit"
                  className={`disc-like ${liked ? 'disc-like--on' : ''}`}
                  aria-label={liked ? 'Убрать отметку "нравится"' : 'Отметить как "нравится"'}
                  title={liked ? 'Не нравится' : 'Нравится'}
                >
                  <svg className="disc-like-ic" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path d="M12.001 5.882c1.528-3.22 6.48-3.585 8.32.062 1.147 2.253.526 4.99-1.57 6.62L12 20l-6.75-7.436c-2.096-1.63-2.717-4.367-1.57-6.62 1.84-3.647 6.792-3.282 8.321-.062z" fill="currentColor" />
                  </svg>
                </button>
              </form>
              <span className="disc-like-count" aria-label="Количество отметок нравится">
                {likesCount}
              </span>
              {canDeletePost ? (
                <form action={deleteDiscussionPostAction} className="disc-inline-form">
                  <input type="hidden" name="id" value={post.id} />
                  <button type="submit" className="disc-btn-danger">Удалить пост</button>
                </form>
              ) : null}
            </div>
          </header>

          <div
            className="disc-text"
            dangerouslySetInnerHTML={{ __html: renderWithMentions(post.text) }}
          />
        </article>

        <section className="disc-comments">
          <h2 className="disc-comments-title">Комментарии</h2>

          <form className="disc-form" action={createDiscussionCommentAction}>
            <input type="hidden" name="postId" value={post.id} />
            <label className="disc-label">Ваш комментарий</label>

            <MentionInput
              name="text"
              placeholder="Добавьте комментарий. Можно упомянуть @username"
              maxLength={4000}
              rows={3}
              className="disc-input disc-textarea"
              required
              resetKey={comments.length} // ключ: число комментариев; после добавления увеличится — поле очистится
            />

            <div className="disc-form-row">
              <span className="disc-help">Новые сверху. После 15 включится прокрутка</span>
              <button type="submit" className="disc-btn">Отправить</button>
            </div>
          </form>

          <div className={`disc-comment-list${comments.length > 15 ? ' is-scroll' : ''}`}>
            {comments.map((c) => {
              const cCreated = fmtEkaterinburg(new Date(c.createdAt));
              const canDelete = c.authorId === session.user.id || canModerateDiscussions(role);
              return (
                <div key={c.id} className="disc-comment">
                  <div className="disc-comment-head">
                    <div className="disc-meta">
                      <span className="disc-author">
                        {c.author?.name ?? 'Без имени'}
                        {c.author?.username ? ` · @${c.author.username}` : ''}
                      </span>
                      <time className="disc-time" dateTime={new Date(c.createdAt).toISOString()}>
                        {cCreated}
                      </time>
                    </div>
                    {canDelete ? (
                      <form action={deleteDiscussionCommentAction} className="disc-inline-form">
                        <input type="hidden" name="commentId" value={c.id} />
                        <button type="submit" className="disc-btn-danger">Удалить</button>
                      </form>
                    ) : null}
                  </div>
                  <div
                    className="disc-comment-text"
                    dangerouslySetInnerHTML={{ __html: renderWithMentions(c.text) }}
                  />
                </div>
              );
            })}
            {comments.length === 0 ? <div className="disc-empty">Комментариев пока нет.</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import PostForm from '../PostForm';
import CommentForm from '../CommentForm';
import {
  updateDiscussionPostAction,
  deleteDiscussionPostAction,
  createDiscussionCommentAction,
  toggleReactionAction,
} from '../actions';
import '../discussions.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmtRuDateTime(d: Date): string {
  const f = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  return f;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) return null;
  const meId = session.user.id;

  const post = await prisma.discussionPost.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true } },
      reactions: true,
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true } } },
      },
      _count: { select: { comments: true, reactions: true } },
    },
  });

  if (!post) {
    return <div className="disc-empty">Пост не найден</div>;
  }

  const likedByMe = post.reactions.some((r) => r.userId === meId);

  return (
    <div className="disc-page">
      <div className="disc-top">
        <h1 className="page-title">Пост</h1>
      </div>

      <div className="grid">
        <div className="left">
          <div className={post.pinned ? 'post-card pinned' : 'post-card'}>
            <div className="post-meta">
              <span className="author">{post.author?.name ?? '—'}</span>
              <span className="dot">•</span>
              <span className="date">{fmtRuDateTime(post.createdAt)}</span>
              <span className="dot">•</span>
              <span className="likes">❤ {post._count.reactions}</span>
              <span className="dot">•</span>
              <span className="comments">Комм. {post._count.comments}</span>
            </div>
            <div className="post-text">{post.text}</div>

            <div className="post-actions">
              <form className="inline" action={toggleReactionAction}>
                <input type="hidden" name="postId" value={post.id} />
                <button className={likedByMe ? 'btn-outline active' : 'btn-outline'} type="submit">
                  Нравится
                </button>
              </form>

              {post.author?.id === meId ? (
                <>
                  <PostForm
                    mode="edit"
                    action={updateDiscussionPostAction}
                    initial={{ id: post.id, text: post.text, pinned: post.pinned }}
                  />
                  <form className="inline" action={deleteDiscussionPostAction}>
                    <input type="hidden" name="id" value={post.id} />
                    <button className="btn-danger" type="submit">Удалить</button>
                  </form>
                </>
              ) : null}
            </div>
          </div>

          <div className="disc-comments">
            <div className="section-title">Комментарии</div>
            {post.comments.map((c) => (
              <div key={c.id} className="comment-card">
                <div className="c-meta">
                  <span className="author">{c.author?.name ?? '—'}</span>
                  <span className="dot">•</span>
                  <span className="date">{fmtRuDateTime(c.createdAt)}</span>
                </div>
                <div className="c-text">{c.text}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="right">
          <div className="sticky">
            <h2 className="block-title">Новый комментарий</h2>
            <CommentForm postId={post.id} createAction={createDiscussionCommentAction} />
          </div>
        </div>
      </div>
    </div>
  );
}

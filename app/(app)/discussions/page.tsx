import Link from 'next/link';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import PostForm from './PostForm';
import {
  createDiscussionPostAction,
  updateDiscussionPostAction,
  deleteDiscussionPostAction,
  toggleReactionAction,
} from './actions';
import './discussions.css';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmtRuDate(d: Date): string {
  const f = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  return f.replace('.', '');
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const meId = session.user.id;

  const pinned = await prisma.discussionPost.findMany({
    where: { pinned: true },
    orderBy: { createdAt: 'desc' },
    include: {
      author: { select: { id: true, name: true } },
      reactions: true,
      _count: { select: { comments: true, reactions: true } },
    },
  });

  const recent = await prisma.discussionPost.findMany({
    where: { pinned: false },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: {
      author: { select: { id: true, name: true } },
      reactions: true,
      _count: { select: { comments: true, reactions: true } },
    },
  });

  const isLiked = (postId: string) =>
    pinned.concat(recent).some(
      (p) => p.id === postId && p.reactions.some((r) => r.userId === meId),
    );

  return (
    <div className="disc-page">
      <div className="disc-top">
        <h1 className="page-title">Объявления и обсуждения</h1>
      </div>

      <div className="grid">
        <div className="left">
          {pinned.length > 0 ? (
            <div className="disc-section">
              <div className="section-title">Закреплённые</div>
              {pinned.map((p) => (
                <div key={p.id} className="post-card pinned">
                  <div className="post-meta">
                    <span className="author">{p.author?.name ?? '—'}</span>
                    <span className="dot">•</span>
                    <span className="date">{fmtRuDate(p.createdAt)}</span>
                    <span className="dot">•</span>
                    <span className="likes">❤ {p._count.reactions}</span>
                    <span className="dot">•</span>
                    <span className="comments">Комм. {p._count.comments}</span>
                  </div>
                  <div className="post-text">{p.text}</div>
                  <div className="post-actions">
                    <form className="inline" action={toggleReactionAction}>
                      <input type="hidden" name="postId" value={p.id} />
                      <button className={isLiked(p.id) ? 'btn-outline active' : 'btn-outline'} type="submit">
                        Нравится
                      </button>
                    </form>
                    {p.author?.id === meId ? (
                      <form className="inline" action={deleteDiscussionPostAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn-danger" type="submit">Удалить</button>
                      </form>
                    ) : null}
                    <Link className="btn-outline" href={`/discussions/${p.id}`}>Открыть</Link>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="disc-section">
            <div className="section-title">Лента</div>
            {recent.map((p) => (
              <div key={p.id} className="post-card">
                <div className="post-meta">
                  <span className="author">{p.author?.name ?? '—'}</span>
                  <span className="dot">•</span>
                  <span className="date">{fmtRuDate(p.createdAt)}</span>
                  <span className="dot">•</span>
                  <span className="likes">❤ {p._count.reactions}</span>
                  <span className="dot">•</span>
                  <span className="comments">Комм. {p._count.comments}</span>
                </div>
                <div className="post-text">{p.text}</div>
                <div className="post-actions">
                  <form className="inline" action={toggleReactionAction}>
                    <input type="hidden" name="postId" value={p.id} />
                    <button className={isLiked(p.id) ? 'btn-outline active' : 'btn-outline'} type="submit">
                      Нравится
                    </button>
                  </form>
                  {p.author?.id === meId ? (
                    <form className="inline" action={deleteDiscussionPostAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn-danger" type="submit">Удалить</button>
                    </form>
                  ) : null}
                  <Link className="btn-outline" href={`/discussions/${p.id}`}>Открыть</Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="right">
          <div className="sticky">
            <h2 className="block-title">Новый пост</h2>
            <PostForm mode="create" action={createDiscussionPostAction} />
          </div>
        </div>
      </div>
    </div>
  );
}

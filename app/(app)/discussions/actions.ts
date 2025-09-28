'use server';

import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canPinDiscussions, canModerateDiscussions } from '@/lib/roles';

function nonEmpty(v: unknown, field: string, max = 4000): string {
  const s = String(v ?? '').trim();
  if (!s) throw new Error(`Поле "${field}" обязательно`);
  if (s.length > max) throw new Error(`Поле "${field}" слишком длинное`);
  return s;
}
function ensureId(id: string, field = 'ID') {
  if (!id || id.length > 64) throw new Error(`${field}: неверный формат`);
}
function invalidateList() { revalidateTag('discussions:list'); }
function invalidatePost(id: string) { revalidateTag(`discussion:${id}`); }

export async function createDiscussionPostAction(form: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const text = nonEmpty(form.get('text'), 'Текст', 8000).replace(/\r\n/g, '\n').trim();
  const wantPinned = (form.get('pinned') as string) === '1';
  const pinned = wantPinned && canPinDiscussions(normalizeRole(session.user.role)) ? true : false;

  const post = await prisma.discussionPost.create({
    data: { authorId: session.user.id, text, pinned },
    select: { id: true },
  });

  invalidateList();
  invalidatePost(post.id);
  revalidatePath('/discussions');
  redirect(`/discussions/${post.id}`);
}

export async function updateDiscussionPostAction(form: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const id = nonEmpty(form.get('id'), 'ID', 64);
  ensureId(id);
  const text = nonEmpty(form.get('text'), 'Текст', 8000).replace(/\r\n/g, '\n').trim();
  const wantPinned = (form.get('pinned') as string) === '1';

  const existing = await prisma.discussionPost.findUnique({
    where: { id },
    select: { authorId: true, pinned: true },
  });
  if (!existing) throw new Error('Пост не найден');

  const role = normalizeRole(session.user.role);
  const isAuthor = existing.authorId === session.user.id;
  const mayPin = canPinDiscussions(role);
  if (!isAuthor && !mayPin) throw new Error('Нет прав на редактирование');

  const pinned = mayPin ? !!wantPinned : existing.pinned;

  await prisma.discussionPost.update({
    where: { id },
    data: { text, pinned },
  });

  invalidateList();
  invalidatePost(id);
  revalidatePath('/discussions');
  revalidatePath(`/discussions/${id}`);
}

export async function deleteDiscussionPostAction(form: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const id = nonEmpty(form.get('id'), 'ID', 64);
  ensureId(id);

  const post = await prisma.discussionPost.findUnique({
    where: { id },
    select: { authorId: true },
  });
  if (!post) throw new Error('Пост не найден');

  const role = normalizeRole(session.user.role);
  const isAuthor = post.authorId === session.user.id;
  const isMod = canModerateDiscussions(role);
  if (!isAuthor && !isMod) throw new Error('Нет прав на удаление');

  await prisma.$transaction([
    prisma.discussionComment.deleteMany({ where: { postId: id } }),
    prisma.discussionReaction.deleteMany({ where: { postId: id } }),
    prisma.discussionPost.delete({ where: { id } }),
  ]);

  invalidateList();
  revalidatePath('/discussions');
  redirect('/discussions');
}

export async function createDiscussionCommentAction(form: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const postId = nonEmpty(form.get('postId'), 'ID поста', 64);
  ensureId(postId);
  const text = nonEmpty(form.get('text'), 'Комментарий', 4000);

  const post = await prisma.discussionPost.findUnique({
    where: { id: postId },
    select: { id: true },
  });
  if (!post) throw new Error('Пост не найден');

  await prisma.discussionComment.create({
    data: { postId, authorId: session.user.id, text },
  });

  invalidateList();
  invalidatePost(postId);
  revalidatePath('/discussions');
  revalidatePath(`/discussions/${postId}`);
}

export async function deleteDiscussionCommentAction(form: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const commentId = nonEmpty(form.get('commentId'), 'ID комментария', 64);
  ensureId(commentId);

  const c = await prisma.discussionComment.findUnique({
    where: { id: commentId },
    select: { authorId: true, postId: true },
  });
  if (!c) throw new Error('Комментарий не найден');

  const role = normalizeRole(session.user.role);
  const isAuthor = c.authorId === session.user.id;
  const isMod = canModerateDiscussions(role);
  if (!isAuthor && !isMod) throw new Error('Нет прав на удаление');

  await prisma.discussionComment.delete({ where: { id: commentId } });

  invalidateList();
  invalidatePost(c.postId);
  revalidatePath('/discussions');
  revalidatePath(`/discussions/${c.postId}`);
}

export async function toggleReactionAction(form: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const postId = nonEmpty(form.get('postId'), 'ID поста', 64);
  ensureId(postId);
  const userId = session.user.id;

  const exists = await prisma.discussionPost.findUnique({
    where: { id: postId },
    select: { id: true },
  });
  if (!exists) throw new Error('Пост не найден');

  const existing = await prisma.discussionReaction.findUnique({
    where: { postId_userId: { postId, userId } },
  });

  if (existing) {
    await prisma.discussionReaction.delete({
      where: { postId_userId: { postId, userId } },
    });
  } else {
    await prisma.discussionReaction.create({
      data: { postId, userId, kind: 'like' },
    });
  }

  invalidateList();
  invalidatePost(postId);
  revalidatePath('/discussions');
  revalidatePath(`/discussions/${postId}`);
}

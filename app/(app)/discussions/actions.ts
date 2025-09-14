'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';

function nonEmpty(v: unknown, field: string, max = 4000): string {
  const s = String(v ?? '').trim();
  if (!s) throw new Error(`Поле "${field}" обязательно`);
  if (s.length > max) throw new Error(`Поле "${field}" слишком длинное`);
  return s;
}
function optional(v: unknown, max = 4000): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (s.length > max) throw new Error('Слишком длинный текст');
  return s;
}

export async function createDiscussionPostAction(form: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const text = nonEmpty(form.get('text'), 'Текст', 8000);
  const pinned = (form.get('pinned') as string) === '1';

  const post = await prisma.discussionPost.create({
    data: { authorId: session.user.id, text, pinned },
    select: { id: true },
  });

  revalidatePath('/discussions');
  redirect(`/discussions/${post.id}`);
}

export async function updateDiscussionPostAction(form: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const id = nonEmpty(form.get('id'), 'ID', 64);
  const text = nonEmpty(form.get('text'), 'Текст', 8000);
  const pinned = (form.get('pinned') as string) === '1';

  // Только автор
  await prisma.discussionPost.update({
    where: { id, authorId: session.user.id },
    data: { text, pinned },
  });

  revalidatePath('/discussions');
  revalidatePath(`/discussions/${id}`);
}

export async function deleteDiscussionPostAction(form: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const id = nonEmpty(form.get('id'), 'ID', 64);

  await prisma.discussionPost.delete({
    where: { id, authorId: session.user.id },
  });

  revalidatePath('/discussions');
  redirect('/discussions');
}

export async function createDiscussionCommentAction(form: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const postId = nonEmpty(form.get('postId'), 'ID поста', 64);
  const text = nonEmpty(form.get('text'), 'Комментарий', 4000);

  await prisma.discussionComment.create({
    data: { postId, authorId: session.user.id, text },
  });

  revalidatePath('/discussions');
  revalidatePath(`/discussions/${postId}`);
}

export async function deleteDiscussionCommentAction(form: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const commentId = nonEmpty(form.get('commentId'), 'ID комментария', 64);

  // Удалить может только автор комментария
  const c = await prisma.discussionComment.findUnique({
    where: { id: commentId },
    select: { authorId: true, postId: true },
  });
  if (!c) throw new Error('Комментарий не найден');
  if (c.authorId !== session.user.id) throw new Error('Нет прав на удаление');

  await prisma.discussionComment.delete({ where: { id: commentId } });

  revalidatePath('/discussions');
  revalidatePath(`/discussions/${c.postId}`);
}

export async function toggleReactionAction(form: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const postId = nonEmpty(form.get('postId'), 'ID поста', 64);
  const userId = session.user.id;

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

  revalidatePath('/discussions');
  revalidatePath(`/discussions/${postId}`);
}

// app/(app)/reviews/bulk-actions.ts
'use server';

import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, hasFullAccess } from '@/lib/roles';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function forbid(): never {
  redirect('/');
}

/**
 * Массовое ревью: принимает форму с выбранными назначениями.
 * В форме есть кнопки submit с name="__op" value="approve|reject".
 */
export async function bulkReviewAction(formData: FormData): Promise<void> {
  const session = await auth();
  const reviewerId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);
  if (!reviewerId) forbid();

  const op = String(formData.get('__op') ?? '');
  const ids = (formData.getAll('ids') as string[]).map((s) => s.trim()).filter(Boolean);
  const reason = ((formData.get('reason') ?? '') as string).trim() || null;

  if (!op || ids.length === 0) {
    revalidatePath('/reviews');
    redirect('/reviews');
  }

  // Проверка доступа: все выбранные назначения должны принадлежать задачам, где reviewer — автор
  // (или роль с полным доступом).
  const rows = await prisma.taskAssignee.findMany({
    where: { id: { in: ids } },
    select: { id: true, task: { select: { createdById: true } } },
  });
  if (rows.length === 0) {
    revalidatePath('/reviews');
    redirect('/reviews');
  }

  if (!hasFullAccess(role)) {
    for (const r of rows) {
      if (r.task?.createdById !== reviewerId) forbid();
    }
  }

  await prisma.$transaction(async (tx) => {
    // Закрыть все открытые сдачи по выбранным назначениям
    await tx.submission.updateMany({
      where: { taskAssigneeId: { in: ids }, open: true },
      data: {
        open: false,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
        reviewerComment: op === 'reject' ? reason : undefined,
      },
    });

    // Обновить статусы назначений
    if (op === 'approve') {
      await tx.taskAssignee.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'done',
          reviewedAt: new Date(),
          reviewedById: reviewerId,
          completedAt: new Date(),
        },
      });
    } else if (op === 'reject') {
      await tx.taskAssignee.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'in_progress',
          reviewedAt: new Date(),
          reviewedById: reviewerId,
        },
      });
    }
  });

  revalidatePath('/reviews');
  redirect('/reviews');
}

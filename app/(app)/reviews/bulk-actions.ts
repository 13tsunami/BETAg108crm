// app/(app)/reviews/bulk-actions.ts
'use server';

import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canCreateTasks } from '@/lib/roles';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

/** Массовое принятие выбранных исполнителей */
export async function approveSelectedAction(formData: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);
  if (!meId || !canCreateTasks(role)) {
    redirect('/inboxtasks');
  }

  const ids = formData.getAll('taskAssigneeId').map(String).filter(Boolean);

  if (ids.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const id of ids) {
        const owner = await tx.taskAssignee.findUnique({
          where: { id },
          select: { task: { select: { createdById: true } } },
        });
        if (!owner || owner.task.createdById !== meId) continue;

        await tx.taskAssignee.update({
          where: { id },
          data: {
            status: 'done',
            submissions: {
              updateMany: {
                where: { open: true },
                data: { open: false, reviewedAt: new Date() },
              },
            },
          },
        });
      }
    });
  }

  revalidatePath('/reviews');
}

/** Массовый возврат выбранных исполнителей */
export async function rejectSelectedAction(formData: FormData): Promise<void> {
  const session = await auth();
  const meId = session?.user?.id ?? null;
  const role = normalizeRole(session?.user?.role);
  if (!meId || !canCreateTasks(role)) {
    redirect('/inboxtasks');
  }

  const ids = formData.getAll('taskAssigneeId').map(String).filter(Boolean);
  const reason = String(formData.get('reason') ?? '').trim() || null;

  if (ids.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const id of ids) {
        const owner = await tx.taskAssignee.findUnique({
          where: { id },
          select: { task: { select: { createdById: true } } },
        });
        if (!owner || owner.task.createdById !== meId) continue;

        await tx.taskAssignee.update({
          where: { id },
          data: {
            status: 'rejected',
            submissions: {
              updateMany: {
                where: { open: true },
                data: { open: false, reviewedAt: new Date(), reviewerComment: reason },
              },
            },
          },
        });
      }
    });
  }

  revalidatePath('/reviews');
}

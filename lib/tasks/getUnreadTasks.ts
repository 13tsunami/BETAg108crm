// lib/tasks/getUnreadTasks.ts
import { prisma } from '@/lib/prisma';

/**
 * Кол-во активных назначений текущего пользователя:
 * status = 'in_progress'
 */
export async function getUnreadTasksCount(userId: string): Promise<number> {
  if (!userId) return 0;
  return prisma.taskAssignee.count({
    where: { userId, status: 'in_progress' },
  });
}

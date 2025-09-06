// lib/tasks/getUnreadTasks.ts
import { prisma } from '@/lib/prisma';

/**
 * Кол-во активных назначений текущего пользователя:
 * status = 'in_progress' и сама задача не скрыта
 */
export async function getUnreadTasksCount(userId: string): Promise<number> {
  if (!userId) return 0;
  return prisma.taskAssignee.count({
    where: {
      userId,
      status: 'in_progress',
      task: { hidden: { not: true } }, // ключевая фильтрация
    },
  });
}

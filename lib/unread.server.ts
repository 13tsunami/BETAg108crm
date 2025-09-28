// lib/unread.server.ts
import { unstable_noStore as noStore } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canProcessRequests, type Role } from '@/lib/roles';

/**
 * Проверки задач.
 * Считаем КОЛИЧЕСТВО исполнителей, у которых есть хотя бы одна открытая отправка,
 * и вы являетесь ревьюером по одному из правил:
 *  1) submission.reviewedById = вы
 *  2) assignee.reviewedById = вы
 *  3) task.reviewRequired = true И task.createdById = вы  ← покрывает первую отправку
 */
export async function getUnreadReviewsCount(userId: string): Promise<number> {
  noStore();

  const count = await prisma.taskAssignee.count({
    where: {
      submissions: { some: { open: true } },
      OR: [
        { reviewedById: userId },
        { submissions: { some: { open: true, reviewedById: userId } } },
        { task: { reviewRequired: true, createdById: userId } },
      ],
    },
  });

  return count;
}

/**
 * Объявления: новые посты/комментарии после lastSeen, автор не вы.
 */
export async function getUnreadDiscussionsCount(userId: string): Promise<number> {
  noStore();

  const { lastSeen } =
    (await prisma.user.findUnique({
      where: { id: userId },
      select: { lastSeen: true },
    })) ?? {};

  const since = lastSeen ?? new Date(0);

  const [posts, comments] = await Promise.all([
    prisma.discussionPost.count({
      where: { createdAt: { gt: since }, NOT: { authorId: userId } },
    }),
    prisma.discussionComment.count({
      where: { createdAt: { gt: since }, NOT: { authorId: userId } },
    }),
  ]);

  return posts + comments;
}

/**
 * Заявки (Requests).
 *
 * Если пользователь МОЖЕТ обрабатывать заявки (sysadmin, deputy_axh, управленцы):
 *  - все status='new' по релевантным target — ВСЕГДА (без учёта lastSeen);
 *  - ПЛЮС назначенные на пользователя (processedById=вы) в статусах in_progress/rejected
 *    с активностью после lastSeen;
 *  - ПЛЮС авторские заявки (authorId=вы), у которых была активность после lastSeen
 *    и статус не 'done'.
 *
 * Если пользователь НЕ может обрабатывать:
 *  - только свои заявки с активностью после lastSeen и статусом не 'done'.
 */
export async function getUnreadRequestsCount(userId: string): Promise<number> {
  noStore();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, lastSeen: true },
  });

  const roleNorm: Role | null = normalizeRole(user?.role ?? null);
  const since = user?.lastSeen ?? new Date(0);
  const processor = canProcessRequests(roleNorm);

  // Релевантные цели для «новых» заявок у процессоров.
  // Управленцы видят все (targets = [] → без фильтра).
  const targets: string[] | null = (() => {
    if (!processor) return null;
    if (roleNorm === 'sysadmin') return ['sysadmin'];
    if (roleNorm === 'deputy_axh') return ['ahch'];
    if (roleNorm === 'deputy' || roleNorm === 'deputy_plus' || roleNorm === 'director') return [];
    return [];
  })();

  if (processor) {
    // 1) Все новые по релевантным целям (без учёта lastSeen)
    const newByTarget = await prisma.request.count({
      where: {
        status: 'new',
        ...(targets && targets.length > 0 ? { target: { in: targets } } : {}),
      },
    });

    // 2) Назначенные на меня, активность после lastSeen
    const assignedActive = await prisma.request.count({
      where: {
        processedById: userId,
        status: { in: ['in_progress', 'rejected'] },
        lastMessageAt: { gt: since },
      },
    });

    // 3) Мои авторские, активность после lastSeen, пока не done
    const myActive = await prisma.request.count({
      where: {
        authorId: userId,
        lastMessageAt: { gt: since },
        NOT: { status: 'done' },
      },
    });

    return newByTarget + assignedActive + myActive;
  }

  // Не процессор: только свои активные после lastSeen, не 'done'
  const myUnread = await prisma.request.count({
    where: {
      authorId: userId,
      lastMessageAt: { gt: since },
      NOT: { status: 'done' },
    },
  });

  return myUnread;
}

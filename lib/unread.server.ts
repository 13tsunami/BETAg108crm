// lib/unread.server.ts
import { unstable_noStore as noStore } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canProcessRequests, type Role } from '@/lib/roles';

/**
 * Открытые сабмишены на вашу проверку.
 * Считаются Submission.open = true, где:
 *  - reviewedById = вы, ИЛИ
 *  - у связанного исполнителя assignee.reviewedById = вы.
 */
export async function getUnreadReviewsCount(userId: string): Promise<number> {
  noStore();
  const count = await prisma.submission.count({
    where: {
      open: true,
      OR: [{ reviewedById: userId }, { assignee: { reviewedById: userId } }],
    },
  });
  return count;
}

/**
 * Новые объявления/комментарии после lastSeen пользователя.
 * Автором не являетесь вы.
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
 * Непрочитанные/требующие внимания заявки.
 *
 * Если пользователь может обрабатывать заявки (sysadmin, deputy_axh, управленцы):
 *  - считаем все status = 'new' по релевантным целям (target),
 *  - плюс назначенные на пользователя (processedById = вы) в работе (in_progress) с активностью > lastSeen,
 *  - плюс авторские заявки (authorId = вы) с активностью > lastSeen, пока они не закрыты.
 *
 * Если пользователь НЕ может обрабатывать:
 *  - только его авторские заявки с активностью > lastSeen и статусом не 'done'.
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

  // Определяем релевантные цели для "новых" заявок, если пользователь — процессор.
  // Для управленцев (deputy/deputy_plus/director) показываем все цели.
  // Для sysadmin — только target = 'sysadmin'; для deputy_axh — только 'ahch'.
  const targets: string[] | null = (() => {
    if (!processor) return null;
    if (roleNorm === 'sysadmin') return ['sysadmin'];
    if (roleNorm === 'deputy_axh') return ['ahch'];
    // управленческий контур видит всё
    if (roleNorm === 'deputy' || roleNorm === 'deputy_plus' || roleNorm === 'director') return [];
    return []; // по умолчанию — все
  })();

  if (processor) {
    // 1) Все новые по релевантным целям
    const newByTarget = await prisma.request.count({
      where: {
        status: 'new',
        ...(targets && targets.length > 0 ? { target: { in: targets } } : {}),
      },
    });

    // 2) Назначенные на меня и в работе, активность после lastSeen
    const assignedToMeActive = await prisma.request.count({
      where: {
        processedById: userId,
        status: 'in_progress',
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

    return newByTarget + assignedToMeActive + myActive;
  }

  // Не процессор: считаем только свои активные после lastSeen, не 'done'
  const myUnread = await prisma.request.count({
    where: {
      authorId: userId,
      lastMessageAt: { gt: since },
      NOT: { status: 'done' },
    },
  });

  return myUnread;
}

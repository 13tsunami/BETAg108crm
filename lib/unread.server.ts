// lib/unread.server.ts
import { unstable_noStore as noStore } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canProcessRequests, type Role } from '@/lib/roles';

/**
 * Проверки задач (reviews).
 *
 * Считаем КОЛИЧЕСТВО TaskAssignee со статусом 'submitted',
 * у которых есть хотя бы один ОТКРЫТЫЙ сабмишен и вы являетесь ревьюером по одному из правил:
 *  1) submission.reviewedById = вы
 *  2) assignee.reviewedById = вы
 *  3) task.reviewRequired = true И task.createdById = вы (первая отправка без явного ревьюера)
 *
 * Такой подсчёт совпадает с тем, что реально видит UI на странице проверок.
 */
export async function getUnreadReviewsCount(userId: string): Promise<number> {
  noStore();

  const count = await prisma.taskAssignee.count({
    where: {
      status: 'submitted',
      OR: [
        // ревьюер задан на самом сабмишене
        { submissions: { some: { open: true, reviewedById: userId } } },
        // ревьюер задан на исполнителе
        { reviewedById: userId, submissions: { some: { open: true } } },
        // автор задачи с требованием ревью — без явного ревьюера
        { task: { reviewRequired: true, createdById: userId }, submissions: { some: { open: true } } },
      ],
    },
  });

  return count;
}

/**
 * Объявления (discussions):
 * «непрочитанные» — это посты/комментарии ПОСЛЕ lastSeen, автор не вы,
 * и в тексте есть @username пользователя с корректными Unicode-границами.
 * Считаем на Node-стороне, без миграций и без PG-регэкспов.
 */
export async function getUnreadDiscussionsCount(userId: string): Promise<number> {
  noStore();

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, lastSeen: true },
  });
  if (!me?.username) return 0;

  // небольшой сдвиг против гонки heartbeat/lastSeen
  const sinceBase = me.lastSeen ?? new Date(0);
  const since = new Date(sinceBase.getTime() - 3000);

  // Лимит, чтобы не тянуть слишком много при очень давнем lastSeen
  const LIMIT = 2000;

  // Посты — по updatedAt (у вас оно есть), комменты — по createdAt
  const [posts, comments] = await Promise.all([
    prisma.discussionPost.findMany({
      where: { updatedAt: { gt: since }, authorId: { not: userId } },
      select: { text: true },
      orderBy: { updatedAt: 'desc' },
      take: LIMIT,
    }),
    prisma.discussionComment.findMany({
      where: { createdAt: { gt: since }, authorId: { not: userId } },
      select: { text: true },
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
    }),
  ]);

  // username → экранируем спецсимволы для regex
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const uname = esc(me.username);

  /**
   * Unicode-границы:
   *  - перед @ — начало строки или НЕ символ "слова логина"
   *  - после имени — конец строки или НЕ символ "слова логина"
   * Слово логина = \p{L} (буквы любых алфавитов) + \p{N} (цифры) + _ . -
   */
  const re = new RegExp(`(^|[^\\p{L}\\p{N}_\\.-])@${uname}($|[^\\p{L}\\p{N}_\\.-])`, 'iu');

  const countIn = (arr: Array<{ text: string }>) =>
    arr.reduce((acc, { text }) => (re.test(text) ? acc + 1 : acc), 0);

  return countIn(posts) + countIn(comments);
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

  // Релевантные target для «новых» заявок у процессоров.
  const targets: string[] | null = (() => {
    if (!processor) return null;
    if (roleNorm === 'sysadmin') return ['sysadmin'];
    if (roleNorm === 'deputy_axh') return ['deputy_axh'];
    if (roleNorm === 'deputy' || roleNorm === 'deputy_plus' || roleNorm === 'director') return [];
    return [];
  })();

  if (processor) {
    const newByTarget = await prisma.request.count({
      where: {
        status: 'new',
        ...(targets && targets.length > 0 ? { target: { in: targets } } : {}),
      },
    });

    const assignedActive = await prisma.request.count({
      where: {
        processedById: userId,
        status: { in: ['in_progress', 'rejected'] },
        lastMessageAt: { gt: since },
      },
    });

    const myActive = await prisma.request.count({
      where: {
        authorId: userId,
        lastMessageAt: { gt: since },
        NOT: { status: 'done' },
      },
    });

    return newByTarget + assignedActive + myActive;
  }

  const myUnread = await prisma.request.count({
    where: {
      authorId: userId,
      lastMessageAt: { gt: since },
      NOT: { status: 'done' },
    },
  });

  return myUnread;
}

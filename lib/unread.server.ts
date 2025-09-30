// lib/unread.server.ts
import { unstable_noStore as noStore } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { normalizeRole, type Role } from '@/lib/roles';

/**
 * Проверки задач (reviews).
 *
 * Считаем КОЛИЧЕСТВО TaskAssignee со статусом 'submitted',
 * у которых есть хотя бы один ОТКРЫТЫЙ сабмишен и вы являетесь ревьюером по одному из правил:
 *  1) submission.reviewedById = вы
 *  2) assignee.reviewedById = вы
 *  3) task.reviewRequired = true и task.createdById = вы (первая отправка без явного ревьюера)
 */
export async function getUnreadReviewsCount(userId: string): Promise<number> {
  noStore();

  const count = await prisma.taskAssignee.count({
    where: {
      status: 'submitted',
      OR: [
        { submissions: { some: { open: true, reviewedById: userId } } },
        { reviewedById: userId, submissions: { some: { open: true } } },
        { task: { reviewRequired: true, createdById: userId }, submissions: { some: { open: true } } },
      ],
    },
  });

  return count;
}

/**
 * Объявления (discussions).
 * «Непрочитанные» — посты/комментарии ПОСЛЕ lastSeen, автор не вы,
 * и текст содержит @username ИЛИ @everyone с корректными Unicode-границами.
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

  const LIMIT = 2000;

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

  // содержимое класса «слово логина»: \p{L}\p{N}_ . -
  const wordClass = String.raw`\p{L}\p{N}_\.\-`;
  const boundaryL = `(^|[^${wordClass}])`;
  const boundaryR = `($|[^${wordClass}])`;

  // экранируем username для regex
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const uname = esc(me.username);

  const reUser = new RegExp(`${boundaryL}@${uname}${boundaryR}`, 'iu');
  const reAll  = new RegExp(`${boundaryL}@everyone${boundaryR}`, 'iu');

  const hit = (t: string) => reUser.test(t) || reAll.test(t);

  const countIn = (arr: Array<{ text: string }>) =>
    arr.reduce((acc, { text }) => (hit(text) ? acc + 1 : acc), 0);

  return countIn(posts) + countIn(comments);
}

/**
 * Заявки (Requests).
 *
 * Правила:
 *  а) У обработчиков ТОЛЬКО двух ролей (sysadmin, deputy_axh) бейдж = текущее число заявок
 *     со статусом 'new' по их таргету. lastSeen не учитываем.
 *     Для deputy_axh допускаем оба написания таргета: 'deputy_axh' и 'ahch'.
 *
 *  б) У автора бейдж вспыхивает, если ПОСЛЕ lastSeen заявка:
 *     — перешла в статус 'in_progress' (по updatedAt),
 *     — ИЛИ появился новый комментарий от обработчика (User.role ∈ {sysadmin, deputy_axh})
 *       в RequestMessage (по createdAt).
 *     Считаем уникальные заявки.
 */
export async function getUnreadRequestsCount(userId: string): Promise<number> {
  noStore();

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, lastSeen: true },
  });

  const roleNorm: Role | null = normalizeRole(me?.role ?? null);
  const since = me?.lastSeen ?? new Date(0);

  const isSysadmin = roleNorm === 'sysadmin';
  const isAhch     = roleNorm === 'deputy_axh';

  // а) обработчики
  if (isSysadmin || isAhch) {
    const targets = isSysadmin ? ['sysadmin'] : ['deputy_axh', 'ahch'];
    const newByTarget = await prisma.request.count({
      where: {
        status: 'new',
        target: { in: targets },
      },
    });
    return newByTarget;
  }

  // б) автор заявки
  const madeInProgress = await prisma.request.findMany({
    where: {
      authorId: userId,
      status: 'in_progress',
      updatedAt: { gt: since },
    },
    select: { id: true },
  });

  const processorCommented = await prisma.requestMessage.findMany({
    where: {
      createdAt: { gt: since },
      request: { authorId: userId },
      author: {
        role: { in: ['sysadmin', 'deputy_axh'] },
      },
    },
    select: { requestId: true },
  });

  const ids = new Set<string>();
  for (const r of madeInProgress) ids.add(r.id);
  for (const m of processorCommented) ids.add(m.requestId);

  return ids.size;
}

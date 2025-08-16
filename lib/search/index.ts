/* lib/search/index.ts */
import 'server-only';
import { unstable_cache as cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import type { IndexOptions, SearchItem } from './types';

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase();
}

async function buildIndex(opts: IndexOptions): Promise<SearchItem[]> {
  const limit = opts.limitPerKind ?? 5000;

  const tasks: Promise<SearchItem[]>[] = [];

  if (opts.kinds.includes('user')) {
    tasks.push(
      prisma.user.findMany({
        select: { id: true, name: true, role: true, classroom: true },
        take: limit,
        orderBy: { name: 'asc' },
      }).then(rows =>
        rows.map(r => ({
          id: r.id,
          kind: 'user' as const,
          label: r.name,
          hint: [r.role, r.classroom].filter(Boolean).join(' • ') || undefined,
          q: [r.name, r.role, r.classroom].filter(Boolean).join(' '),
        })),
      )
    );
  }

  if (opts.kinds.includes('group')) {
    tasks.push(
      prisma.group.findMany({
        select: { id: true, name: true, _count: { select: { members: true } } },
        take: limit,
        orderBy: { name: 'asc' },
      }).then(rows =>
        rows.map(g => ({
          id: g.id,
          kind: 'group' as const,
          label: g.name,
          hint: g._count.members ? `участников: ${g._count.members}` : undefined,
          q: g.name,
        })),
      )
    );
  }

  if (opts.kinds.includes('subject')) {
    tasks.push(
      prisma.subject.findMany({
        select: { id: true, name: true, _count: { select: { members: true } } },
        take: limit,
        orderBy: { name: 'asc' },
      }).then(rows =>
        rows.map(s => ({
          id: s.id,
          kind: 'subject' as const,
          label: s.name,
          hint: s._count.members ? `преподавателей: ${s._count.members}` : undefined,
          q: s.name,
        })),
      )
    );
  }

  if (opts.kinds.includes('role')) {
    tasks.push(
      prisma.user.findMany({
        select: { role: true },
        where: { role: { not: null } },
        distinct: ['role'],
        orderBy: { role: 'asc' },
        take: limit,
      }).then(rows =>
        rows
          .map(r => r.role!)
          .filter(Boolean)
          .map(role => ({
            id: role,
            kind: 'role' as const,
            label: role,
            q: role,
          } satisfies SearchItem)),
      )
    );
  }

  const parts = await Promise.all(tasks);
  const all = parts.flat();
  return all.map(it => ({ ...it, q: norm(it.q) }));
}

// ВАЖНО: keyParts — массив строк; аргументы функции тоже попадают в ключ кэша.
// Для устойчивости к порядку kinds канонизируем их перед сборкой.
export const getSearchIndex = cache(
  async (opts: IndexOptions) => {
    const kindsSorted = [...opts.kinds].sort() as IndexOptions['kinds'];
    return buildIndex({ ...opts, kinds: kindsSorted });
  },
  ['search-index'],
  { revalidate: 120, tags: ['search-index'] },
);

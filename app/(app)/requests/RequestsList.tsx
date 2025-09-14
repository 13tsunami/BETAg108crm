import Link from 'next/link';
import { prisma } from '@/lib/prisma';

type Props = {
  target?: string | null;
  status?: 'new' | 'in_progress' | 'done' | 'rejected' | null;
  mineOnly?: boolean;
  meId: string;
  take?: number;
  cursor?: string | null;
};

function fmtRuDateTime(d: Date): string {
  const f = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  return f.replace('.', '');
}

export default async function RequestsList({
  target,
  status,
  mineOnly = false,
  meId,
  take = 20,
  cursor,
}: Props) {
  const where: any = {};
  if (target) where.target = target;
  if (status) where.status = status;
  if (mineOnly) where.authorId = meId;

  const items = await prisma.request.findMany({
    where,
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    take,
    cursor: cursor ? { id: cursor } : undefined,
    include: {
      author: { select: { id: true, name: true } },
    },
  });

  if (items.length === 0) {
    return <div className="req-empty">Заявок нет</div>;
  }

  return (
    <div className="req-list">
      {items.map((r) => (
        <Link key={r.id} className="req-card" href={`/requests/${r.id}`}>
          <div className="req-row">
            <div className="req-num">
              <span className="req-tag">{r.target}</span>
              <span className="req-gn">#{r.globalNumber}</span>
              {r.targetNumber ? <span className="req-tn">/{r.targetNumber}</span> : null}
            </div>
            <div className={`req-status s-${r.status}`}>{r.status}</div>
          </div>
          <div className="req-title">{r.title}</div>
          <div className="req-meta">
            <span className="req-author">{r.author?.name ?? '—'}</span>
            <span className="req-dot">•</span>
            <span className="req-date">{fmtRuDateTime(r.lastMessageAt)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

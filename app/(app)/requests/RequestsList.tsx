// app/(app)/requests/RequestsList.tsx
import Link from 'next/link';
import { prisma } from '@/lib/prisma';

type Props = {
  meId: string;
  status?: string;
  mineOnly: boolean;
  processorTarget: 'deputy_axh' | 'sysadmin' | null;
};

export default async function RequestsList({ meId, status, mineOnly, processorTarget }: Props) {
  const where: Record<string, unknown> = {};

  if (status) where.status = status as any;

  if (mineOnly) {
    where.authorId = meId; // строго свои авторские
  } else if (processorTarget) {
    // обработчик видит адресные ему + свои авторские
    where.OR = [{ target: processorTarget }, { authorId: meId }];
  } else {
    where.authorId = meId; // для прочих — свои авторские
  }

  const items = await prisma.request.findMany({
    where,
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      title: true,
      status: true,
      target: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  });

  if (items.length === 0) {
    return <div className="emptyMuted">Заявок нет</div>;
  }

  return (
    <div className="reqList">
      {items.map((r) => (
        <Link key={r.id} href={`/requests/${r.id}`} className="reqRow">
          <div className="reqRowTop">
            <div className="reqRowTitle" title={r.title}>{r.title}</div>
            <span className={`statusBadge status-${r.status}`}>{statusLabel(r.status)}</span>
          </div>

          <div className="reqRowSub">
            <span className="subItem">{r.author?.name ?? 'Автор'}</span>
            <span className="dot">·</span>

            {/* мини-бейдж «кому» с цветом */}
            <span
              className={`miniBadge ${targetClass(r.target)}`}
              aria-label={targetLabel(r.target)}
              title={targetLabel(r.target)}
            >
              {targetShort(r.target)}
            </span>

            <span className="dot">·</span>
            <time className="subItem">{formatDate(r.createdAt)}</time>
          </div>
        </Link>
      ))}
    </div>
  );
}

function statusLabel(s: string | null): string {
  if (!s) return '—';
  switch (s) {
    case 'new': return 'Новая';
    case 'in_progress': return 'В работе';
    case 'done': return 'Завершена';
    case 'rejected': return 'Отклонена';
    default: return s;
  }
}

function targetLabel(t: string | null): string {
  if (!t) return '—';
  if (t === 'deputy_axh') return 'Для заместителя по АХЧ';
  if (t === 'sysadmin')   return 'Для системного администратора';
  return t;
}

// короткий текст внутри бейджа, чтобы строка была компактной
function targetShort(t: string | null): string {
  if (!t) return '—';
  if (t === 'deputy_axh') return 'АХЧ';
  if (t === 'sysadmin')   return 'Сисадмин';
  return t;
}

// маппинг на цвет
function targetClass(t: string | null): string {
  if (!t) return '';
  if (t === 'deputy_axh') return 'target-deputy';
  if (t === 'sysadmin')   return 'target-sysadmin';
  return '';
}

function formatDate(d: Date | string | null): string {
  if (!d) return '—';
  const dd = typeof d === 'string' ? new Date(d) : d;
  return dd.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

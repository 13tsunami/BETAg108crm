import Link from 'next/link';
import { prisma } from '@/lib/prisma';

type Props = {
  meId: string;
  status?: string;
  mineOnly?: boolean;
  processorTarget: 'deputy_axh' | 'sysadmin' | null;
};

export default async function RequestsList({
  meId,
  status,
  mineOnly,
  processorTarget,
}: Props) {
  // Эффективный фильтр видимости:
  // - если нет processorTarget → только свои авторские
  // - если есть processorTarget и mineOnly=true → только свои авторские
  // - если есть processorTarget и mineOnly=false → адресные заявки этого обработчика + свои авторские
  const whereVisibility =
    processorTarget && !mineOnly
      ? { OR: [{ target: processorTarget }, { authorId: meId }] }
      : { authorId: meId };

  const requests = await prisma.request.findMany({
    where: {
      AND: [
        whereVisibility,
        status ? { status: status as any } : {},
      ],
    },
    orderBy: { lastMessageAt: 'desc' },
    include: { author: true },
  });

  return (
    <div className="req-list">
      {requests.map((r) => (
        <Link key={r.id} href={`/requests/${r.id}`} className="req-card">
          <div className="req-title">{r.title}</div>
          <div className={`req-status ${r.status}`}>{r.status}</div>
          <div className="req-meta">{r.author?.name}</div>
        </Link>
      ))}
    </div>
  );
}

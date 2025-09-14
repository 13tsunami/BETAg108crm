import { prisma } from '@/lib/prisma';

type Props = { id: string };

function fmtRuDateTime(d: Date): string {
  const f = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  return f;
}

export default async function RequestView({ id }: Props) {
  const req = await prisma.request.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true } },
      processedBy: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true } } },
      },
    },
  });

  if (!req) {
    return <div className="req-empty">Заявка не найдена</div>;
  }

  return (
    <div className="req-view">
      <div className="req-header">
        <div className="req-numline">
          <span className="req-tag">{req.target}</span>
          <span className="req-gn">#{req.globalNumber}</span>
          {req.targetNumber ? <span className="req-tn">/{req.targetNumber}</span> : null}
        </div>
        <div className={`req-status s-${req.status}`}>{req.status}</div>
      </div>

      <h1 className="req-title">{req.title}</h1>

      <div className="req-meta">
        <span>Автор: {req.author?.name ?? '—'}</span>
        <span className="req-dot">•</span>
        <span>Создано: {fmtRuDateTime(req.createdAt)}</span>
        {req.closedAt ? (
          <>
            <span className="req-dot">•</span>
            <span>Закрыто: {fmtRuDateTime(req.closedAt)}</span>
          </>
        ) : null}
      </div>

      {req.rejectedReason ? (
        <div className="req-reason">Причина отклонения: {req.rejectedReason}</div>
      ) : null}

      <div className="req-messages">
        {req.messages.map((m) => (
          <div key={m.id} className="req-msg">
            <div className="req-msg-meta">
              <span className="req-msg-author">{m.author?.name ?? '—'}</span>
              <span className="req-dot">•</span>
              <span className="req-msg-date">{fmtRuDateTime(m.createdAt)}</span>
            </div>
            <div className="req-msg-body">{m.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

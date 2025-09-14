import type { Prisma } from '@prisma/client';

type RequestFull = Prisma.RequestGetPayload<{
  include: {
    author: true;
    processedBy: true;
    messages: { include: { author: true } };
  };
}>;

export default function RequestView({ req }: { req: RequestFull }) {
  return (
    <div className="req-view req-card">
      <h2 className="req-h2">{req.title}</h2>

      <div className={`req-status ${req.status}${req.closedAt === null && req.status === 'in_progress' ? ' updated' : ''}`}>
        {req.status}
      </div>

      <div className="req-meta">
        Автор: <span className="req-name">{req.author?.name}</span>
        {' • '}
        Создано: {req.createdAt.toLocaleString('ru-RU')}
        {req.processedBy ? (
          <>
            {' • '}Исполнитель: <span className="req-name">{req.processedBy.name}</span>
          </>
        ) : null}
        {req.closedAt ? (
          <>
            {' • '}Закрыто: {req.closedAt.toLocaleString('ru-RU')}
          </>
        ) : null}
      </div>

      {req.body ? <p className="req-body">{req.body}</p> : null}

      {/* чат сообщений */}
      <div className="chat">
        {req.messages.map((m) => {
          const fromAuthor = m.authorId === req.authorId;
          const fromProcessor =
            !!req.processedBy && m.authorId === req.processedBy.id;

          const sideClass = fromProcessor ? 'from-processor' : 'from-author'; // по умолчанию считаем автором

          return (
            <div key={m.id} className={`msg-row ${sideClass}`}>
              <div className="msg-bubble">
                <div className="msg-head">
                  <span className="msg-name">
                    {m.author?.name ?? 'Без имени'}
                  </span>
                  <span className="msg-ts">
                    {m.createdAt.toLocaleString('ru-RU')}
                  </span>
                </div>
                <div className="msg-text">{m.body}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

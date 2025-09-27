// app/(app)/requests/[id]/page.tsx
import { redirect, notFound } from 'next/navigation';
import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import ReplyForm from '../ReplyForm';
import DeleteButton from '../DeleteButton';
import '@/app/(app)/requests/requests.css';

type PageProps = {
  // ВАЖНО: и params, и searchParams — Promise<...>
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  // Извлекаем id из params через await
  const { id } = await params;
  const meId = session.user.id as string;

  const req = await prisma.request.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true } },
      processedBy: { select: { id: true, name: true } },
      messages: {
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!req) notFound();

  const canDelete =
    req.authorId === meId ||
    (session.user as any).role === 'sysadmin' ||
    (session.user as any).role === 'deputy_axh';

  return (
    <div className="reqChatPage">
      <header className="chatHeader card">
  <div className="chatHeaderRow">
    <h1 className="chatTitle">{req.title || 'Заявка'}</h1>

    <div className="chatHeaderRight">
      <span className={`statusBadge status-${req.status}`}>{statusLabel(req.status)}</span>
      {canDelete ? <DeleteButton requestId={req.id} /> : null}
    </div>
  </div>
  <div className="chatMeta">
    Создал: {req.author?.name ?? req.authorId} • {formatDate(req.createdAt)}
  </div>
</header>



          <main className="chatWindow card">
  {/* Первичное описание — только если есть И это не повтор заголовка */}
  {req.body && req.body.trim() !== (req.title ?? '').trim() ? (
    <article className="msg msg-system">
      <div className="msgBody">{req.body}</div>
      <time className="msgTime">{formatDate(req.createdAt)}</time>
    </article>
  ) : null}

  {req.messages.length === 0 && <div className="emptyMuted">Сообщений пока нет</div>}

  {(() => {
    let lastDate: Date | null = req.body ? new Date(req.createdAt) : null;

    return req.messages.map((m) => {
      const mine = m.authorId === meId;
      const curDate = new Date(m.createdAt);
      const needDateDivider = !lastDate || lastDate.toDateString() !== curDate.toDateString();
      lastDate = curDate;

      return (
        <div key={m.id}>
          {needDateDivider && (
            <div className="dateDivider"><span>{formatDateDay(curDate)}</span></div>
          )}
          <article className={`msg ${mine ? 'msg-me' : 'msg-peer'}`}>
            {!mine && <div className="msgHead">{m.author?.name ?? m.authorId}</div>}
            {m.body ? <div className="msgBody">{m.body}</div> : null}
            <time className="msgTime">{formatTime(curDate)}</time>
          </article>
        </div>
      );
    });
  })()}
</main>



      <footer className="composer card">
        <ReplyForm requestId={req.id} />
      </footer>
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
  if (t === 'deputy_axh') return 'Заместитель по АХЧ';
  if (t === 'sysadmin') return 'Системный администратор';
  return t;
}

function formatDate(d: Date | string | null): string {
  if (!d) return '—';
  const dd = typeof d === 'string' ? new Date(d) : d;
  return dd.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function formatDateDay(d: Date | string): string {
  const dd = typeof d === 'string' ? new Date(d) : d;
  return dd.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(d: Date | string): string {
  const dd = typeof d === 'string' ? new Date(d) : d;
  return dd.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

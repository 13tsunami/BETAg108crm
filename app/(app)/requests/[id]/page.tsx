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

// Таймзона проекта: Екатеринбург
const APP_TZ = process.env.NEXT_PUBLIC_APP_TZ || 'Asia/Yekaterinburg';

function asDate(d: Date | string): Date {
  return typeof d === 'string' ? new Date(d) : d;
}

function formatDate(d: Date | string | null): string {
  if (!d) return '—';
  const dd = asDate(d);
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: APP_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dd);
}

function formatDateDay(d: Date | string): string {
  const dd = asDate(d);
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: APP_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(dd);
}

function formatTime(d: Date | string): string {
  const dd = asDate(d);
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: APP_TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(dd);
}

// Сравнение календарного дня в нужной таймзоне
function sameDayInTz(a: Date, b: Date): boolean {
  const f = new Intl.DateTimeFormat('ru-RU', {
    timeZone: APP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return f.format(a) === f.format(b);
}

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
      processedBy: { select: { id: true, name: true} },
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
        {/* Первичное описание — только если есть и это не повтор заголовка */}
        {req.body && req.body.trim() !== (req.title ?? '').trim() ? (
          <article className="msg msg-system">
            <div className="msgBody">{req.body}</div>
            <time className="msgTime">{formatDate(req.createdAt)}</time>
          </article>
        ) : null}

        {req.messages.length === 0 && <div className="emptyMuted">Сообщений пока нет</div>}

        {(() => {
          let lastDate: Date | null = req.body ? asDate(req.createdAt) : null;

          return req.messages.map((m) => {
            const mine = m.authorId === meId;
            const curDate = asDate(m.createdAt);
            const needDateDivider = !lastDate || !sameDayInTz(lastDate, curDate);
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

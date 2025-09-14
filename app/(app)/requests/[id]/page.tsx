import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import RequestView from '../RequestView';
import { replyRequestAction, closeRequestAction, reopenRequestAction } from '../actions';
import ReplyForm from '../ReplyForm';
import '../requests.css';

function processorTarget(raw: unknown): 'deputy_axh' | 'sysadmin' | null {
  const r = typeof raw === 'string' ? raw.trim() : '';
  if (r === 'deputy_axh') return 'deputy_axh';
  if (r === 'sysadmin') return 'sysadmin';
  return null;
}

type Params = Promise<{ id: string }>;

export default async function Page({ params }: { params: Params }) {
  const { id } = await params;

  const session = await auth();
  if (!session) redirect('/');

  const meId = session.user.id as string;
  const pTarget = processorTarget((session.user as any).role);

  const req = await prisma.request.findUnique({
    where: { id },
    include: {
      author: true,
      processedBy: true,
      messages: { include: { author: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!req) redirect('/requests');

  // автор или обработчик с совпадающим target
  const canView = req.authorId === meId || (pTarget !== null && req.target === pTarget);
  if (!canView) redirect('/requests');

  // авто-взятие только своим обработчиком
  if (req.status === 'new' && pTarget !== null && req.target === pTarget) {
    await prisma.request.update({
      where: { id: req.id },
      data: { status: 'in_progress', processedById: meId },
    });
    redirect(`/requests/${req.id}`);
  }

  const canProcess = pTarget !== null && req.target === pTarget;

  return (
    <div className="req-page">
      <div className="left">
        <RequestView req={req} />
        <ReplyForm
          requestId={req.id}
          replyAction={replyRequestAction}
          closeAction={canProcess && req.status === 'in_progress' ? closeRequestAction : undefined}
          reopenAction={req.authorId === meId && req.status === 'done' ? reopenRequestAction : undefined}
        />
      </div>
    </div>
  );
}

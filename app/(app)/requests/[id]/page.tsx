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

export default async function Page({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return redirect('/');

  const meId = session.user.id as string;
  const pTarget = processorTarget((session.user as any).role);

  const req = await prisma.request.findUnique({
    where: { id: params.id },
    include: {
      author: true,
      processedBy: true,
      messages: { include: { author: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!req) return redirect('/requests');

  // Право просмотра: автор ИЛИ обработчик с совпадающим target
  const canView =
    req.authorId === meId || (pTarget !== null && req.target === pTarget);
  if (!canView) return redirect('/requests');

  // Авто-взятие в работу — только для "своих" адресных заявок
  if (req.status === 'new' && pTarget !== null && req.target === pTarget) {
    await prisma.request.update({
      where: { id: req.id },
      data: { status: 'in_progress', processedById: meId },
    });
    return redirect(`/requests/${req.id}`);
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

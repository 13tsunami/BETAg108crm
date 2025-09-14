import { auth } from '@/auth.config';
import { normalizeRole, canProcessRequests } from '@/lib/roles';
import RequestView from '../RequestView';
import ReplyForm from '../ReplyForm';
import { replyRequestAction, takeRequestAction, closeRequestAction } from '../actions';
import '../requests.css';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Page(props: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const role = normalizeRole(session.user.role);
  const canProcess = canProcessRequests(role);

  return (
    <div className="req-page">
      <div className="req-top">
        <h1 className="page-title">Заявка</h1>
      </div>

      <div className="grid">
        <div className="left">
          <RequestView id={id} />
        </div>
        <div className="right">
          <div className="sticky">
            <h2 className="block-title">Ответ</h2>
            <ReplyForm
              requestId={id}
              replyAction={replyRequestAction}
              takeAction={canProcess ? takeRequestAction : undefined}
              closeAction={canProcess ? closeRequestAction : undefined}
              canProcess={!!canProcess}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

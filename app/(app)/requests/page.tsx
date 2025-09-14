import { auth } from '@/auth.config';
import { redirect } from 'next/navigation';
import RequestsList from './RequestsList';
import RequestForm from './RequestForm';
import { createRequestAction } from './actions';
import './requests.css';

type SearchParams = Promise<Record<string, string | undefined>>;

function processorTarget(raw: unknown): 'deputy_axh' | 'sysadmin' | null {
  const r = typeof raw === 'string' ? raw.trim() : '';
  if (r === 'deputy_axh') return 'deputy_axh';
  if (r === 'sysadmin') return 'sysadmin';
  return null;
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session) return redirect('/');

  const meId = session.user.id as string;
  const pTarget = processorTarget((session.user as any).role);

  const params = await searchParams;
  const status = params.status || undefined;

  // Для не-обработчиков всегда показываем только свои заявки.
  // Для обработчиков по умолчанию показываем их адресные заявки (и их собственные авторские).
  // mineOnly оставляем как опцию: true — строго свои авторские.
  const mineOnly = pTarget ? params.mineOnly === 'true' : true;

  return (
    <div className="req-page">
      <div className="left">
        <RequestsList
          meId={meId}
          status={status}
          mineOnly={mineOnly}
          processorTarget={pTarget}
        />
      </div>
      <div className="right">
        <RequestForm createAction={createRequestAction} />
      </div>
    </div>
  );
}

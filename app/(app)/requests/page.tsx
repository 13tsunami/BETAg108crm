// app/(app)/requests/page.tsx
import { auth } from '@/auth.config';
import { redirect } from 'next/navigation';
import RequestsList from './RequestsList';
import CreateForm from './CreateForm';
import './requests.css';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function processorTarget(raw: unknown): 'deputy_axh' | 'sysadmin' | null {
  const r = typeof raw === 'string' ? raw.trim() : '';
  if (r === 'deputy_axh') return 'deputy_axh';
  if (r === 'sysadmin') return 'sysadmin';
  return null;
}

function pickStr(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const meId = session.user.id as string;
  const pTarget = processorTarget((session.user as any).role);

  const params = await searchParams;
  const status = pickStr(params.status) || undefined;
  const mineOnly = pTarget ? pickStr(params.mineOnly) === 'true' : true;

  return (
    <div className="req-page">
      <div className="left">
        <div className="card">
          <h1 className="h1" style={{ margin: 0, marginBottom: 8 }}>Заявки</h1>
          <RequestsList
            meId={meId}
            status={status}
            mineOnly={mineOnly}
            processorTarget={pTarget}
          />
        </div>
      </div>

      <div className="right">
        <div className="card">
          <h2 className="h1" style={{ margin: 0, marginBottom: 8 }}>Новая заявка</h2>
          <CreateForm />
        </div>
      </div>
    </div>
  );
}

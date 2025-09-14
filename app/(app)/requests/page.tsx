import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { normalizeRole, canProcessRequests } from '@/lib/roles';
import RequestsList from './RequestsList';
import RequestForm from './RequestForm';
import { createRequestAction } from './actions';
import './requests.css';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function pick<T extends string>(v: string | undefined, allowed: readonly T[]): T | null {
  if (!v) return null;
  return (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user?.id) return null; // редиректится в мидлваре/роутинге

  const sp = await searchParams;
  const targetQ = typeof sp.target === 'string' ? sp.target : null;
  const statusQ = pick(sp.status as string | undefined, ['new', 'in_progress', 'done', 'rejected'] as const);
  const mineOnly = sp.mine === '1';

  const meId = session.user.id;
  const role = normalizeRole(session.user.role);
  const canProcess = canProcessRequests(role);

  // Для фильтров можно подтянуть доступные target-ы из RequestCounter, но пока вручную
  const counters = await prisma.requestCounter.findMany({ orderBy: { target: 'asc' } });
  const knownTargets = counters.map((c) => c.target);

  return (
    <div className="req-page">
      <div className="req-top">
        <h1 className="page-title">Заявки</h1>
        <div className="filters">
          <form className="filters-form" method="GET">
            <select name="target" defaultValue={targetQ ?? ''} className="inp">
              <option value="">Все адресаты</option>
              {knownTargets.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select name="status" defaultValue={statusQ ?? ''} className="inp">
              <option value="">Все статусы</option>
              <option value="new">new</option>
              <option value="in_progress">in_progress</option>
              <option value="done">done</option>
              <option value="rejected">rejected</option>
            </select>
            <label className="chk">
              <input type="checkbox" name="mine" value="1" defaultChecked={mineOnly} /> Мои
            </label>
            <button className="btn-outline" type="submit">Показать</button>
          </form>
        </div>
      </div>

      <div className="grid">
        <div className="left">
          <RequestsList
            target={targetQ}
            status={statusQ}
            mineOnly={mineOnly}
            meId={meId}
          />
        </div>
        <div className="right">
          <div className="sticky">
            <h2 className="block-title">Новая заявка</h2>
            <RequestForm createAction={createRequestAction} />
            {canProcess ? <div className="hint">У вас есть права обработчика заявок</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

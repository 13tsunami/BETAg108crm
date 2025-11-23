// app/(app)/dashboard/page.tsx
import { auth } from '@/auth.config';
import { normalizeRole, roleOrder } from '@/lib/roles';
import s from './page.module.css';

import Widgets from './widgets';
import { getAnalytics } from './analytics';
import { getWeeklyReport } from './weekly';
import type { Analytics, Scope, TabKey, WeeklyReport } from './types';

import FortuneCookieClient from './FortuneCookieClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function canScopeAll(role: string | undefined | null): boolean {
  const r = normalizeRole(role);
  if (!r) return false;
  return roleOrder.indexOf(r) >= roleOrder.indexOf('deputy');
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const tab: TabKey = params.tab === 'weekly' ? 'weekly' : 'live';
  const rawDays = Number(params.days ?? 14);
  const days: 1 | 7 | 14 | 30 =
    ([1, 7, 14, 30] as const).includes(rawDays as any) ? (rawDays as any) : 14;

  const session = await auth();
  const meId = (session?.user as any)?.id ?? null;
  const roleSlug = (session?.user as any)?.role as string | undefined;

  const scopeAllowedAll = canScopeAll(roleSlug);
  const reqScope = (params.scope === 'all' ? 'all' : 'me') as Scope;
  const scope: Scope = scopeAllowedAll ? reqScope : 'me';

  const analytics: Analytics = await getAnalytics({
    meId,
    rangeDays: days,
    tz: 'Asia/Yekaterinburg',
    scope,
  });

  const weekly: WeeklyReport = await getWeeklyReport({
    meId,
    tz: 'Asia/Yekaterinburg',
    scope,
  });

  return (
    <div className={s.dashboardRoot}>
      <header className={s.header}>
        <div className={s.headerTop}>
          <div className={s.title}>АНАЛИТИКА</div>
          <div className={s.cookieSlot}>
            <FortuneCookieClient userId={meId} />
          </div>
        </div>

        <div className={s.subtitle}>
          Динамическая аналитика и отчёт недели.
        </div>
      </header>

      <Widgets
        analytics={analytics}
        weekly={weekly}
        roleCanScopeAll={scopeAllowedAll}
        activeTab={tab}
        scope={scope}
        days={days}
      />
    </div>
  );
}

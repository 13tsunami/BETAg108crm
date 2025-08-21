// app/(app)/dashboard/page.tsx
import { auth } from '@/auth.config';
import { normalizeRole } from '@/lib/roles';
import s from './page.module.css';

import Widgets from './widgets';
import { getAnalytics } from './analytics';
import type { Analytics } from './types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rangeDays = Number(params?.days ?? 14);

  const session = await auth();
  const meId = (session?.user as any)?.id ?? null;
  const roleSlug = (session?.user as any)?.role as string | undefined;
  const role = normalizeRole(roleSlug || 'guest');

  const showCreatedDone = role !== 'teacher';

  const analytics: Analytics = await getAnalytics({
    meId,
    rangeDays: Number.isFinite(rangeDays) && rangeDays > 0 ? rangeDays : 14,
    tz: 'Asia/Yekaterinburg',
  });

  return (
    <div className={s.dashboardRoot}>
      <header className={s.header}>
        <div className={s.title}>Аналитика</div>
        <div className={s.subtitle}>Сверните плитку для KPI, нажмите — развернётся график</div>
      </header>

      <Widgets analytics={analytics} showCreatedDone={showCreatedDone} />
    </div>
  );
}

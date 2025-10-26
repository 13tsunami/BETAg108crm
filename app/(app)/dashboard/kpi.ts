// app/(app)/dashboard/kpi.ts
'use server';

import { auth } from '@/auth.config';
import { getAnalytics } from './analytics';
import type { Analytics } from './types';

const TZ = 'Asia/Yekaterinburg';
export type DashboardKpi = Analytics;

export async function getDashboardKpi(args?: {
  meId?: string | null;
  rangeDays?: number;
  tz?: string;
}): Promise<DashboardKpi> {
  const session = await auth();
  const meId = args?.meId ?? ((session?.user as any)?.id ?? null);
  const rangeDays = Number.isFinite(args?.rangeDays as number) && (args!.rangeDays as number) > 0
    ? (args!.rangeDays as number)
    : 30;
  const tz = args?.tz ?? TZ;

  return getAnalytics({
    meId,
    rangeDays,      // теперь тип number ок
    tz,
    scope: 'me',    // фасад всегда персонально
  });
}

'use client';

import { useState } from 'react';
import type { Analytics } from './types';
import s from './page.module.css';
import {
  CreatedDoneChart,
  TodayBars,
  TodayDonut,
  WeekdayBars,
} from './charts';

export type Props = {
  analytics: Analytics;
  showCreatedDone: boolean;
};

export default function Widgets({ analytics, showCreatedDone }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const totalCreated = analytics.createdDone.reduce((sum, d) => sum + d.created, 0);
  const totalDone    = analytics.createdDone.reduce((sum, d) => sum + d.done, 0);
  const totalToday   = analytics.today.today + analytics.today.overdue + analytics.today.upcoming;

  return (
    <div className={s.widgets}>
      {showCreatedDone && (
        <div
          className={`${s.card} ${expanded === 'createdDone' ? s.expanded : s.collapsed}`}
          onClick={() => setExpanded(expanded === 'createdDone' ? null : 'createdDone')}
        >
          <div className={s.cardTitle}>Создано / Выполнено</div>
          {expanded === 'createdDone' ? (
            <CreatedDoneChart data={analytics.createdDone} />
          ) : (
            <div className={s.tileKPI}>
              <div className={s.kpiItem}>
                <div className={s.kpiLabel}>создано</div>
                <div className={s.kpiValueBrand}>{totalCreated}</div>
              </div>
              <div className={s.kpiItem}>
                <div className={s.kpiLabel}>выполнено</div>
                <div className={s.kpiValueMuted}>{totalDone}</div>
              </div>
            </div>
          )}
        </div>
      )}

      <div
        className={`${s.card} ${expanded === 'today' ? s.expanded : s.collapsed}`}
        onClick={() => setExpanded(expanded === 'today' ? null : 'today')}
      >
        <div className={s.cardTitle}>Задачи на сегодня</div>
        {expanded === 'today' ? (
          <TodayBars data={analytics.today} />
        ) : (
          // Свернутый вид — как в «Нагрузке по дням недели»: один KPI «всего»
          <div className={s.tileKPI}>
            <div className={s.kpiItem}>
              <div className={s.kpiLabel}>всего</div>
              <div className={s.kpiValueStrong}>{totalToday}</div>
            </div>
          </div>
        )}
      </div>

      <div
        className={`${s.card} ${expanded === 'weekday' ? s.expanded : s.collapsed}`}
        onClick={() => setExpanded(expanded === 'weekday' ? null : 'weekday')}
      >
        <div className={s.cardTitle}>Нагрузка по дням недели</div>
        {expanded === 'weekday' ? (
          <WeekdayBars data={analytics.weekday} />
        ) : (
          <div className={s.tileKPI}>
            <div className={s.kpiItem}>
              <div className={s.kpiLabel}>всего</div>
              <div className={s.kpiValueStrong}>
                {analytics.weekday.reduce((s, d) => s + d.count, 0)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { Analytics, DayPoint, WeekdayLoad } from './types';
import s from './page.module.css';
import {
  CreatedDoneChart,
  PrioritiesDonut,
  TodayBars,
  WeekdayBars,
} from './charts';

export type Props = {
  analytics: Analytics;
  showCreatedDone: boolean;
};

export default function Widgets({ analytics, showCreatedDone }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const totalCreated = analytics.createdDone.reduce(
    (sum: number, d: DayPoint) => sum + d.created,
    0,
  );
  const totalDone = analytics.createdDone.reduce(
    (sum: number, d: DayPoint) => sum + d.done,
    0,
  );
  const weekdayWork = analytics.weekday.slice(0, 5).reduce(
    (s: number, d: WeekdayLoad) => s + d.count,
    0,
  );
  const weekdayWeekend = analytics.weekday.slice(5).reduce(
    (s: number, d: WeekdayLoad) => s + d.count,
    0,
  );
  const weekdayAll = analytics.weekday.reduce(
    (s: number, d: WeekdayLoad) => s + d.count,
    0,
  );

  return (
    <div className={s.widgets}>
      {showCreatedDone && (
        <div
          className={`${s.card} ${expanded === 'createdDone' ? s.expanded : s.collapsed}`}
          onClick={() =>
            setExpanded(expanded === 'createdDone' ? null : 'createdDone')
          }
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
        className={`${s.card} ${expanded === 'priorities' ? s.expanded : s.collapsed}`}
        onClick={() => setExpanded(expanded === 'priorities' ? null : 'priorities')}
      >
        <div className={s.cardTitle}>Приоритеты</div>
        {expanded === 'priorities' ? (
          <PrioritiesDonut data={analytics.priorities} />
        ) : (
          <div className={s.tileKPI}>
            <div className={s.kpiItem}>
              <div className={s.kpiLabel}>срочно</div>
              <div className={s.kpiValueBrand}>{analytics.priorities.high}</div>
            </div>
            <div className={s.kpiItem}>
              <div className={s.kpiLabel}>обычная задача</div>
              <div className={s.kpiValueMuted}>{analytics.priorities.normal}</div>
            </div>
            <div className={s.kpiItem}>
              <div className={s.kpiLabel}>всего</div>
              <div className={s.kpiValueStrong}>
                {analytics.priorities.high + analytics.priorities.normal}
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className={`${s.card} ${expanded === 'today' ? s.expanded : s.collapsed}`}
        onClick={() =>
          setExpanded(expanded === 'today' ? null : 'today')
        }
      >
        <div className={s.cardTitle}>Задачи на сегодня</div>
        {expanded === 'today' ? (
          <TodayBars data={analytics.today} />
        ) : (
          <div className={s.tileKPI}>
            <div className={s.kpiItem}>
              <div className={s.kpiLabel}>сегодня</div>
              <div className={s.kpiValueBrand}>{analytics.today.today}</div>
            </div>
            <div className={s.kpiItem}>
              <div className={s.kpiLabel}>просрочено</div>
              <div className={s.kpiValueDanger}>{analytics.today.overdue}</div>
            </div>
            <div className={s.kpiItem}>
              <div className={s.kpiLabel}>ожидает</div>
              <div className={s.kpiValueMuted}>{analytics.today.upcoming}</div>
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
              <div className={s.kpiLabel}>пн–пт</div>
              <div className={s.kpiValueBrand}>{weekdayWork}</div>
            </div>
            <div className={s.kpiItem}>
              <div className={s.kpiLabel}>выходные</div>
              <div className={s.kpiValueMuted}>{weekdayWeekend}</div>
            </div>
            <div className={s.kpiItem}>
              <div className={s.kpiLabel}>всего</div>
              <div className={s.kpiValueStrong}>{weekdayAll}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

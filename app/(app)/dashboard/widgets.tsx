// app/(app)/dashboard/widgets.tsx
'use client';

import { Suspense, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import s from './page.module.css';
import { CreatedDoneChart, TodayBars, TodayDonut, WeekdayBars } from './charts';
import type { Analytics, DayPoint, TodaySlice, WeekdayBar, WeeklyReport, Scope, TabKey } from './types';

type Props = {
  analytics: Analytics;
  weekly: WeeklyReport;
  roleCanScopeAll: boolean; // <- сервер уже вычисляет: true для deputy+
  activeTab: TabKey;
  scope: Scope;
  days: 1 | 7 | 14 | 30;
};

export default function Widgets(props: Props) {
  return (
    <Suspense fallback={<div>Загрузка…</div>}>
      <Inner {...props} />
    </Suspense>
  );
}

function Inner({ analytics, weekly, roleCanScopeAll, activeTab, scope, days }: Props) {
  // ВСЕ ПЛИТКИ СРАЗУ СВЕРНУТЫ
  const [open, setOpen] = useState<Record<string, boolean>>({
    today: false,
    createdDone: false,
    weekday: false,
    sla: false,
    weeklyTop: false,
    weeklyDyn: false,
    weeklyLate: false,
  });

  // Маппинги данных
  const createdDone: DayPoint[] = useMemo(
    () => analytics.createdVsDone.map(p => ({ d: p.day, created: p.created, done: p.done })),
    [analytics.createdVsDone],
  );

  const todaySlice: TodaySlice = useMemo(() => {
    const t = analytics.today;
    const upcomingRaw = t.totalAssigned - t.dueToday - t.overdue;
    return { today: t.dueToday, overdue: t.overdue, upcoming: Math.max(0, upcomingRaw) };
  }, [analytics.today]);

  const weekdayLoad: WeekdayBar[] = useMemo(
    () => [...analytics.loadByWeekday].sort((a,b)=>a.weekday-b.weekday).map(w => ({ dow: w.weekday, count: w.count })),
    [analytics.loadByWeekday],
  );

  return (
    <>
      {/* Панель: табы + чипы «Период» (только для Живой) + тумблер «Охват» (только для deputy+) */}
      <Tabs roleCanScopeAll={roleCanScopeAll} />

      {activeTab === 'live' ? (
        <section className={s.widgets}>
          {/* Сегодня */}
          <Card id="today" title="Сегодня" open={open.today} setOpen={setOpen}>
            <div className={s.tileGrid2}>
              <TodayDonut data={todaySlice} />
              <TodayBars data={todaySlice} />
            </div>
            <Hint>Задания со сроком сегодня, просрочки и всё, что ожидает внимания.</Hint>
          </Card>

          {/* Создано / Выполнено */}
          <Card id="createdDone" title={`Активность за ${days} ${days === 1 ? 'день' : 'дней'}`} open={open.createdDone} setOpen={setOpen}>
            <CreatedDoneChart data={createdDone} />
            <div className={s.legend}>
              <div className={s.legendRow}><span className={s.dotBrand} />Назначено</div>
              <div className={s.legendRow}><span className={s.dotInk} />Выполнено</div>
            </div>
            <Hint>Сколько назначений появлялось и сколько завершалось каждый день выбранного периода.</Hint>
          </Card>

          {/* Нагрузка по дням недели */}
          <Card id="weekday" title="Нагрузка по дням недели" open={open.weekday} setOpen={setOpen}>
            <WeekdayBars data={weekdayLoad} />
            <Hint>выборка за неделю</Hint>
          </Card>

          {/* Заявки и проверки */}
          <Card id="sla" title="Заявки и проверки" open={open.sla} setOpen={setOpen}>
            <div className={s.tileKPI}>
              <KPI label="открыто сейчас" value={analytics.requestsSla.open} tone="strong" />
              <KPI label="закрыто ≤24ч" value={analytics.requestsSla.done24h} tone="brand" />
              <KPI label="медиана, ч" value={analytics.requestsSla.medianHours} tone="muted" />
              <KPI label="ожидают проверки" value={analytics.pendingForReview} tone="danger" />
            </div>
            <Hint>Скорость работы с заявками и сколько работ ждут проверки.</Hint>
          </Card>
        </section>
      ) : (
        // WEEKLY
        <section className={s.widgets}>
          <Card id="weeklyTop" title="Итоги недели" open={open.weeklyTop} setOpen={setOpen}>
            <div className={s.tileKPI}>
              <KPI label="выполнено" value={weekly.doneCount7d} tone="strong" />
              <KPI label="доля просроченных" value={Math.round(weekly.lateRate7d*100)} suffix="%" tone="danger" />
              <KPI label="среднее время, ч" value={weekly.avgHoursToComplete7d} tone="muted" />
            </div>
            <Hint>Последние 7 дней: сколько завершено, сколько из них позже срока и среднее время до завершения.</Hint>
          </Card>

          <Card id="weeklyDyn" title="Динамика выполненных (7 дн.)" open={open.weeklyDyn} setOpen={setOpen}>
            <CreatedDoneChart data={weekly.seriesDone7d.map(p => ({ d: p.day, created: 0, done: p.done }))} />
            <Hint>Сколько назначений завершалось каждый день.</Hint>
          </Card>

          <Card id="weeklyLate" title="Просрочки за неделю" open={open.weeklyLate} setOpen={setOpen}>
            <WeekdayBars data={weekly.seriesLate7d.map((p,i)=>({ dow: (i%7)+1 as any, count: p.late }))} />
            <Hint>Просроченные завершения по дням. Чем выше столбец — тем больше случаев.</Hint>
          </Card>
        </section>
      )}
    </>
  );
}

/* ——— Общие подкомпоненты ——— */

function Card(props: { id: string; title: string; open: boolean; setOpen: any; children: any }) {
  const { id, title, open, setOpen, children } = props;
  return (
    <article
      className={`${s.card} ${open ? s.expanded : s.collapsed}`}
      onClick={() => setOpen((o: any) => ({ ...o, [id]: !o[id] }))}
      role="button" tabIndex={0} aria-expanded={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen((o: any) => ({ ...o, [id]: !o[id] })); }}
    >
      <h3 className={s.cardTitle}>{title}</h3>
      <div className={s.tileBody}>{children}</div>
    </article>
  );
}

function KPI({ label, value, suffix = '', tone }:
  { label: string; value: number | string; suffix?: string; tone: 'brand'|'muted'|'danger'|'strong' }) {
  const cls =
    tone === 'brand' ? s.kpiValueBrand :
    tone === 'muted' ? s.kpiValueMuted :
    tone === 'danger'? s.kpiValueDanger : s.kpiValueStrong;
  return (
    <div className={s.kpiItem}>
      <div className={s.kpiLabel}>{label}</div>
      <div className={cls}>{value}{suffix}</div>
    </div>
  );
}

function Hint({ children }: { children: any }) {
  return <div className={s.kpiLabel} style={{ textAlign: 'center' }}>{children}</div>;
}

/* ——— Панель управления: табы + чипы периода + чипы охвата ——— */

function Tabs({ roleCanScopeAll }: { roleCanScopeAll: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();

  const go = (tab: 'live'|'weekly') => {
    const p = new URLSearchParams(sp as any); p.set('tab', tab);
    router.push(`${pathname}?${p.toString()}`);
  };
  const curTab = (sp.get('tab') ?? 'live') as 'live'|'weekly';

  return (
    <div className={s.controlsRow} role="navigation" aria-label="Переключение аналитики">
      <button
        onClick={() => go('live')}
        className={`${s.chip} ${ curTab === 'live' ? s.chipActive : '' }`}
        aria-pressed={curTab==='live'}
      >Динамика</button>

      <button
        onClick={() => go('weekly')}
        className={`${s.chip} ${ curTab === 'weekly' ? s.chipActive : '' }`}
        aria-pressed={curTab==='weekly'}
      >Отчёт недели</button>

      <div className={s.controlsSpacer} />

      {/* Период показываем только на «Живой аналитике» */}
      {curTab === 'live' && <DaysChips />}

      {/* Охват показываем только для deputy и выше */}
      {roleCanScopeAll ? <ScopeChips /> : null}
    </div>
  );
}

function DaysChips() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const set = (d: 1|7|14|30) => { const p = new URLSearchParams(sp as any); p.set('days', String(d)); router.push(`${pathname}?${p.toString()}`); };
  const cur = Number(sp.get('days') ?? 14);

  const items: Array<{v: 1|7|14|30; label: string}> = [
    { v: 1,  label: '1 день' },
    { v: 7,  label: '7 дней' },
    { v: 14, label: '14 дней' },
    { v: 30, label: '30 дней' },
  ];

  return (
    <div className={s.chipsGroup} role="group" aria-label="Период (количество дней)">
      <span className={s.ctrlLabel}>Период:</span>
      {items.map(it => (
        <button
          key={it.v}
          onClick={() => set(it.v)}
          className={`${s.chip} ${cur===it.v? s.chipActive:''}`}
          aria-pressed={cur===it.v}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function ScopeChips() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const scope = (sp.get('scope') ?? 'me') as Scope;
  const set = (sco: Scope) => { const p = new URLSearchParams(sp as any); p.set('scope', sco); router.push(`${pathname}?${p.toString()}`); };

  return (
    <div className={s.chipsGroup} role="group" aria-label="Охват данных">
      <span className={s.ctrlLabel}>Охват:</span>
      <button onClick={() => set('me')}  className={`${s.chip} ${scope==='me'?  s.chipActive:''}`}  aria-pressed={scope==='me'}>Мои</button>
      <button onClick={() => set('all')} className={`${s.chip} ${scope==='all'? s.chipActive:''}`} aria-pressed={scope==='all'}>По всем</button>
    </div>
  );
}

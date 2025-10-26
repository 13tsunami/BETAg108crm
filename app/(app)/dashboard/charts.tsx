// app/(app)/dashboard/charts.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import s from './page.module.css';
import type { DayPoint, TodaySlice, WeekdayLoad } from './types';

function useMeasure() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const cr = entry.contentRect;
      setSize({ w: Math.max(0, cr.width), h: Math.max(0, cr.height) });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

export function CreatedDoneChart({ data }: { data: DayPoint[] }) {
  const { ref, w, h } = useMeasure();
  const height = Math.max(220, h || 0);
  const pad = { l: 36, r: 16, t: 16, b: 28 };

  const maxCreated = data.reduce((m, d) => Math.max(m, d.created), 0);
  const maxDone = data.reduce((m, d) => Math.max(m, d.done), 0);
  const maxY = Math.max(1, maxCreated, maxDone);

  const n = data.length;
  const plotW = Math.max(0, w - pad.l - pad.r);
  const plotH = Math.max(0, height - pad.t - pad.b);
  const xi = (i: number) => pad.l + (plotW * i) / Math.max(1, n - 1);
  const yi = (val: number) => height - pad.b - (plotH * val) / maxY;

  const ptsCreated = data.map((d, i) => [xi(i), yi(d.created)] as const);
  const ptsDone = data.map((d, i) => [xi(i), yi(d.done)] as const);
  const path = (pts: readonly (readonly [number, number])[]) =>
    pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');

  const gridY = Array.from({ length: 4 }, (_, i) => Math.round((maxY * i) / 3));
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div ref={ref} className={s.chartBox} style={{ height }}>
      <svg width="100%" height="100%">
        <rect x={0} y={0} width="100%" height="100%" fill="#fff" />

        {gridY.map((gy, i) => {
          const yy = yi(gy);
          return (
            <g key={i}>
              <line x1={pad.l} y1={yy} x2={w - pad.r} y2={yy} stroke="#e5e7eb" strokeDasharray="4 4" />
              <text x={8} y={yy + 4} fontSize="11" fill="#6b7280">
                {gy}
              </text>
            </g>
          );
        })}

        <path d={path(ptsCreated)} className={s.lineBrand} fill="none" strokeWidth={2} />
        <path d={path(ptsDone)} className={s.lineInk} fill="none" strokeWidth={2} />

        {ptsCreated.map((p, i) => (
          <circle key={`c-${i}`} cx={p[0]} cy={p[1]} r={3} className={s.dotBrand} />
        ))}
        {ptsDone.map((p, i) => (
          <circle key={`d-${i}`} cx={p[0]} cy={p[1]} r={3} className={s.dotInk} />
        ))}

        {data.map((_, i) => (
          <rect
            key={`hit-${i}`}
            x={xi(i) - plotW / Math.max(1, n - 1) / 2}
            y={pad.t}
            width={Math.max(10, plotW / Math.max(1, n - 1))}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}

        {typeof hover === 'number' && data[hover] && (
          <g className={s.tooltipAnim}>
            <rect
              x={xi(hover) - 64}
              y={Math.min(yi(data[hover].created), yi(data[hover].done)) - 54}
              width={128}
              height={46}
              rx={8}
              fill="#fff"
              stroke="#e5e7eb"
            />
            <text
              x={xi(hover)}
              y={Math.min(yi(data[hover].created), yi(data[hover].done)) - 34}
              fontSize="12"
              textAnchor="middle"
              fill="#0f172a"
              fontWeight={700}
            >
              {data[hover].d}
            </text>
            <text
              x={xi(hover)}
              y={Math.min(yi(data[hover].created), yi(data[hover].done)) - 16}
              fontSize="11"
              textAnchor="middle"
              fill="#6b7280"
            >
              создано: {data[hover].created} • выполнено: {data[hover].done}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export function TodayBars({ data }: { data: TodaySlice }) {
  const { ref, w } = useMeasure();
  const height = 180;
  const pad = { l: 28, r: 16, t: 16, b: 30 };

  const cats = [
    { key: 'today', label: 'сегодня', val: data.today, color: 'var(--brand)' },
    { key: 'overdue', label: 'просрочено', val: data.overdue, color: '#b91c1c' },
    { key: 'upcoming', label: 'ожидает', val: data.upcoming, color: '#111827' },
  ];
  const maxY = Math.max(1, ...cats.map(c => c.val));
  const plotW = Math.max(0, w - pad.l - pad.r);
  const plotH = Math.max(0, height - pad.t - pad.b);
  const bw = Math.max(18, Math.min(60, plotW / cats.length - 12));
  const step = plotW / cats.length;

  return (
    <div ref={ref} className={s.chartBox} style={{ height }}>
      <svg width="100%" height="100%">
        <rect x={0} y={0} width="100%" height="100%" fill="#fff" />
        {cats.map((c, i) => {
          const x = pad.l + i * step + (step - bw) / 2;
          const h = (plotH * c.val) / maxY;
          const y = height - pad.b - h;
          return (
            <g key={c.key} className={s.barAnim}>
              <rect x={x} y={y} width={bw} height={h} rx={6} className={s.barGrow} fill={c.color} opacity={0.9} />
              <text x={x + bw / 2} y={height - 10} fontSize="12" textAnchor="middle" fill="#6b7280">
                {c.label}
              </text>
              <text x={x + bw / 2} y={y - 6} fontSize="12" textAnchor="middle" fill="#111827">
                {c.val}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function TodayDonut({ data }: { data: TodaySlice }) {
  const total = Math.max(1, data.today + data.overdue + data.upcoming);
  const angToday = (data.today / total) * 2 * Math.PI;
  const angOverdue = (data.overdue / total) * 2 * Math.PI;
  const angUpcoming = (data.upcoming / total) * 2 * Math.PI;

  const width = 340;
  const size = 160;
  const r = 60;
  const cx = 90;
  const cy = size / 2;

  function arcPath(startAngle: number, angle: number) {
    const endAngle = startAngle + angle;
    const large = angle > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  }
  const pct = (x: number) => Math.round((x / total) * 100);

  return (
    <div className={s.chartBox} style={{ height: size }}>
      <svg width={width} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="#f3f4f6" />
        <path d={arcPath(-Math.PI / 2, angToday)} fill="var(--brand)" opacity={0.9} className={s.sliceAnim} />
        <path d={arcPath(-Math.PI / 2 + angToday, angOverdue)} fill="#b91c1c" opacity={0.9} className={s.sliceAnim} />
        <path
          d={arcPath(-Math.PI / 2 + angToday + angOverdue, angUpcoming)}
          fill="#111827"
          opacity={0.9}
          className={s.sliceAnim}
        />
        <circle cx={cx} cy={cy} r={r - 24} fill="white" />
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="16" fill="#111827" fontWeight={700}>
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="12" fill="#6b7280">
          всего
        </text>

        <g transform={`translate(${180}, ${cy - 18})`}>
          <rect x={0} y={-10} width={10} height={10} fill="var(--brand)" />
          <text x={18} y={0} fontSize="12" fill="#111827">
            Сегодня — {data.today} ({pct(data.today)}%)
          </text>
          <rect x={0} y={14} width={10} height={10} fill="#b91c1c" />
          <text x={18} y={24} fontSize="12" fill="#111827">
            Просрочено — {data.overdue} ({pct(data.overdue)}%)
          </text>
          <rect x={0} y={38} width={10} height={10} fill="#111827" />
          <text x={18} y={48} fontSize="12" fill="#111827">
            Ожидает — {data.upcoming} ({pct(data.upcoming)}%)
          </text>
        </g>
      </svg>
    </div>
  );
}

export function WeekdayBars({ data }: { data: WeekdayLoad }) {
  const { ref, w } = useMeasure();
  const height = 160;
  const pad = { l: 28, r: 16, t: 16, b: 28 };

  const maxY = Math.max(...data.map(d => d.count), 1);
  const plotW = Math.max(0, w - pad.l - pad.r);
  const plotH = Math.max(0, height - pad.t - pad.b);
  const bw = Math.max(20, plotW / Math.max(1, data.length) - 8);
  const step = plotW / Math.max(1, data.length);

  const x = (i: number) => pad.l + i * step + (step - bw) / 2;
  const labels = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const;

  return (
    <div ref={ref} className={s.chartBox} style={{ height }}>
      <svg width="100%" height="100%">
        <rect x={0} y={0} width="100%" height="100%" fill="#fff" />
        {data.map((d, i) => {
          const xi = x(i);
          const h = (plotH * d.count) / Math.max(1, maxY);
          const y = height - pad.b - h;
          return (
            <g key={d.dow} className={s.barAnim}>
              <rect x={xi} y={y} width={bw} height={h} rx={6} className={s.barGrow} fill="#111827" />
              <text x={xi + bw / 2} y={height - 8} fontSize="12" textAnchor="middle" fill="#6b7280">
                {labels[i]}
              </text>
              <text x={xi + bw / 2} y={y - 6} fontSize="12" textAnchor="middle" fill="#111827">
                {d.count}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

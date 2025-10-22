// app/(app)/schedule/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import s from './schedule.module.css';

const BASE_EMBED =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70XYt4Hw0DZGGLW4nCGsNw4W6W4T5nprqF1yHlhKQ0IO0NGojD3skjIPEDY4MfkB5qtA6nkXOnDky/pubhtml';

const SHEETS: { name: string; gid: string }[] = [
  { name: 'Расписание-табличный формат', gid: '0' },
];

const LS_HEIGHT = 'scheduleHeightPx';
const LS_ZOOM = 'scheduleZoom';

const DEFAULT_H = 900;
const MIN_H = 300;
const MAX_H = 2200;
const BASE_WIDTH = 1200;

export default function SchedulePage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [height, setHeight] = useState<number>(DEFAULT_H);
  const [zoom, setZoom] = useState<number>(100);
  const [activeGid, setActiveGid] = useState<string>(SHEETS[0]?.gid ?? '0');
  const dragging = useRef(false);

  useEffect(() => {
    const h = parseInt(localStorage.getItem(LS_HEIGHT) || '', 10);
    if (!Number.isNaN(h)) setHeight(clamp(h, MIN_H, MAX_H));
    const z = parseInt(localStorage.getItem(LS_ZOOM) || '', 10);
    if (!Number.isNaN(z)) setZoom(clamp(z, 50, 200));
  }, []);

  const scale = useMemo(() => zoom / 100, [zoom]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current || !containerRef.current) return;
      const top = containerRef.current.getBoundingClientRect().top;
      setHeight(clamp(e.clientY - top, MIN_H, MAX_H));
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      localStorage.setItem(LS_HEIGHT, String(height));
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [height]);

  function startDrag() {
    dragging.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';
  }

  const iframeUrl = useMemo(() => {
    const u = new URL(BASE_EMBED);
    const sp = u.searchParams;
    sp.set('widget', 'true');
    sp.set('headers', 'false');
    sp.set('chrome', 'true');
    sp.set('gid', activeGid);
    u.search = sp.toString();
    return u.toString();
  }, [activeGid]);

  useEffect(() => {
    if (iframeRef.current) iframeRef.current.src = iframeUrl;
  }, [iframeUrl]);

  const rawHeight = Math.max(1, Math.round(height / scale));
  const rawWidth = BASE_WIDTH;

  return (
    <div className={`${s.themeBrand} h-full flex flex-col min-w-0`}>
      <div className="glass card relief p-3 mb-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-medium mr-auto">Расписание</h2>

          <div className={s.btnGroup}>
            {SHEETS.map(({ name, gid }) => (
              <button
                key={gid}
                onClick={() => setActiveGid(gid)}
                className={`${s.brandBtn} ${
                  gid === activeGid ? s.brandBtnActive : s.brandBtnGhost
                }`}
                title={`Открыть лист: ${name}`}
              >
                {name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label className={s.controlLabel}>Масштаб:</label>
            <input
              aria-label="Масштаб"
              type="range"
              min={50}
              max={200}
              step={5}
              value={zoom}
              onChange={(e) => {
                const v = clamp(parseInt(e.target.value, 10), 50, 200);
                setZoom(v);
                localStorage.setItem(LS_ZOOM, String(v));
              }}
            />
            <span className={s.scaleValue}>{zoom}%</span>
          </div>

          <Link href={iframeUrl} target="_blank" className={s.linkBtn}>
            Открыть в новом окне
          </Link>

          <button
            onClick={() => {
              if (iframeRef.current) {
                const src = iframeRef.current.src;
                iframeRef.current.src = src;
              }
            }}
            className={s.secondaryBtn}
          >
            Обновить
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`glass card relief relative overflow-hidden ${s.fluidCard}`}
        style={{ height }}
      >
        <div
          className={s.scaledHost}
          style={{ transform: `scale(${scale})`, height: rawHeight, width: rawWidth }}
        >
          <iframe
            ref={iframeRef}
            src={iframeUrl}
            className={s.iframeRaw}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            allowFullScreen
          />
        </div>

        <div onPointerDown={startDrag} title="Потяните, чтобы изменить высоту" className={s.resizeHandle} />
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

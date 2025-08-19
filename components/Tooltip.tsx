'use client';

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Pos = { top: number; left: number };

export default function Tooltip({
  children,
  content,
}: {
  children: ReactNode;
  content: ReactNode;
}) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);

  // пересчёт позиции относительно окна
  const compute = () => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();

    const GAP = 8; // расстояние от якоря
    let top = r.top - GAP; // всплываем вверх
    let left = r.left + r.width / 2;

    // если не помещаемся сверху — показываем снизу
    if (top < 8) top = r.bottom + GAP;

    // лёгкий clamp по горизонтали, чтобы не вылазил за экран
    const vw = window.innerWidth;
    const margin = 8;
    left = Math.min(Math.max(left, margin), vw - margin);

    setPos({ top, left });
  };

  // рендерим в body порталом
  const Portal = ({ children }: { children: ReactNode }) => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
      setMounted(true);
      return () => setMounted(false);
    }, []);
    if (!mounted) return null;
    return createPortal(children, document.body);
  };

  useLayoutEffect(() => {
    if (!open) return;
    compute();
    const onScroll = () => compute();
    const onResize = () => compute();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <span
        ref={anchorRef}
        style={{ position: 'relative', display: 'inline-flex' }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        {children}
      </span>

      {open && pos && (
        <Portal>
          <div
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform: 'translate(-50%, -100%)', // по умолчанию над якорем
              // если тултип снизу (top был скорректирован на bottom+GAP), инвертируем transform:
              // сделаем это через небольшую проверку:
              ...(anchorRef.current && pos.top > (anchorRef.current.getBoundingClientRect().bottom + 4)
                ? {} // сверху
                : { transform: 'translate(-50%, 0%)' } // снизу
              ),
              zIndex: 9999, // над сайдбаром
              background: 'rgba(255,255,255,.92)',
              backdropFilter: 'saturate(180%) blur(10px)',
              WebkitBackdropFilter: 'saturate(180%) blur(10px)',
              border: '1px solid rgba(229,231,235,.9)',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 13,
              color: '#111827',
              whiteSpace: 'nowrap',
              boxShadow: '0 10px 28px rgba(0,0,0,.12)',
              pointerEvents: 'none', // чтобы hover не «лип»
            }}
          >
            {content}
          </div>
        </Portal>
      )}
    </>
  );
}

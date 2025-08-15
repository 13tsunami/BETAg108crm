'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

export default function SearchBox({ initial }: { initial?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(initial ?? '');

  const base = useMemo(() => {
    const obj = Object.fromEntries(sp?.entries() ?? []);
    delete obj.ok; delete obj.error;
    return obj;
  }, [sp]);

  // debounce + IME-guard (не триггерим во время набора по раскладке/IME)
  const timerRef = useRef<number | null>(null);
  const composingRef = useRef(false);

  useEffect(() => { setQ(initial ?? ''); }, [initial]);

  function push(qNext: string) {
    const params = new URLSearchParams(base);
    if (qNext) params.set('q', qNext); else params.delete('q');
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname);
  }

  function schedule(qNext: string) {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    // только если пусто или 2+ символа — чтобы не дергать сервер каждую букву
    const shouldUpdate = qNext.length === 0 || qNext.length >= 2;
    timerRef.current = window.setTimeout(() => {
      if (!composingRef.current && shouldUpdate) push(qNext);
    }, 450);
  }

  return (
    <input
      value={q}
      onChange={(e) => { const v = e.target.value; setQ(v); schedule(v); }}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={(e) => { composingRef.current = false; schedule((e.target as HTMLInputElement).value); }}
      onBlur={(e) => push(e.currentTarget.value)}         // мгновенно по blur
      onKeyDown={(e) => { if (e.key === 'Enter') push(q); }} // мгновенно по Enter
      placeholder="поиск: фио, email, телефон, классное руководство, логин, роль…"
      style={{
        height: 36,
        fontSize: 14,
        width: 520,
        maxWidth: '60ch',
        padding: '6px 10px',
        borderRadius: 10,
        border: '1px solid rgba(229,231,235,.9)',
        background: '#fff',
        outline: 'none',
      }}
    />
  );
}

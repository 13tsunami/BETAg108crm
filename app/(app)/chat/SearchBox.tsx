'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export default function SearchBox({ initialQuery }: { initialQuery: string }) {
  const [q, setQ] = useState<string>(initialQuery);
  const formRef = useRef<HTMLFormElement | null>(null);
  const timer = useRef<number | null>(null);

  // автосабмит с лёгким debounce, чтобы не дёргать сервер на каждый символ
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const f = formRef.current;
      if (f) f.requestSubmit();
    }, 200);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [q]);

  return (
    <form ref={formRef} action="/chat" method="get">
      <input
        className="searchInput"
        name="q"
        value={q}
        onChange={(e)=>setQ(e.target.value)}
        placeholder="поиск: ФИО, e-mail, телефон"
      />
      <style jsx>{`
        .searchInput {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          outline: none;
          background: #fff;
        }
        .searchInput:focus {
          border-color:#c7e3ff;
          box-shadow: 0 0 0 4px rgba(59,130,246,.08);
        }
      `}</style>
    </form>
  );
}

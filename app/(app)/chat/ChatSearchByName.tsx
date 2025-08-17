'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import s from './chat.module.css';

type FoundUser = { id: string; name: string | null };

export default function ChatSearchByName() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<FoundUser[]>([]);
  const acRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);

  const canSearch = useMemo(() => q.trim().length >= 1, [q]);

  useEffect(() => {
    if (!canSearch) { setItems([]); setLoading(false); return; }
    setLoading(true);
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/chat/search-name?q=${encodeURIComponent(q.trim())}`, {
          method: 'GET',
          cache: 'no-store',
          signal: ac.signal,
          headers: { accept: 'application/json' },
        });
        if (!res.ok) throw new Error('search failed');
        const data = (await res.json()) as FoundUser[];
        setItems(data);
      } catch {
        if (!ac.signal.aborted) setItems([]);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 170); // лёгкий дебаунс

    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [q, canSearch]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const root = document.getElementById('chatSearchRoot');
      const dd = document.getElementById('chatSearchDd');
      if (root?.contains(t) || dd?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div id="chatSearchRoot" className={s.searchBlock}>
      <div className={s.searchRow}>
        <input
          value={q}
          onChange={(e)=>{ setQ(e.target.value); setOpen(true); }}
          onFocus={()=> setOpen(true)}
          placeholder="Поиск по ФИО…"
          className="searchInput"
        />
      </div>

      {open && (
        <div id="chatSearchDd" className={s.dd}>
          {!canSearch && <div className={s.ddItem} style={{ color:'#6b7280' }}>введите букву(ы)</div>}
          {canSearch && loading && <div className={s.ddItem} style={{ color:'#6b7280' }}>поиск…</div>}
          {canSearch && !loading && items.length === 0 && (
            <div className={s.ddItem} style={{ color:'#6b7280' }}>ничего не найдено</div>
          )}
          {canSearch && !loading && items.map(u => (
            <form key={u.id} action="/chat" method="get">
              <input type="hidden" name="start" value={u.id} />
              <button className={s.ddItem} type="submit" title={u.name ?? ''}>
                {u.name || u.id}
              </button>
            </form>
          ))}
        </div>
      )}

      <style jsx>{`
        .searchInput {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          outline: none;
          background:#fff;
        }
        .searchInput:focus {
          border-color:#c7e3ff;
          box-shadow: 0 0 0 4px rgba(59,130,246,.08);
        }
      `}</style>
    </div>
  );
}

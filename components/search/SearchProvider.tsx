/* components/search/SearchProvider.tsx */
'use client';

import { createContext, use, useContext, useMemo, useState, useDeferredValue, startTransition } from 'react';
import type { SearchItem, SearchKind } from '@/lib/search/types';

type Ctx = {
  items: SearchItem[];
  query: string;
  setQuery: (q: string) => void;
  kinds?: ReadonlyArray<SearchKind>;
  results: SearchItem[];
  filterKinds: (kinds: ReadonlyArray<SearchKind>) => void;
};

const SearchCtx = createContext<Ctx | null>(null);

export function SearchProvider(props: { items: SearchItem[]; kinds?: ReadonlyArray<SearchKind>; children: React.ReactNode }) {
  const [query, setQueryState] = useState('');
  const [kinds, setKinds] = useState<ReadonlyArray<SearchKind> | undefined>(props.kinds);

  function setQuery(q: string) {
    // не дергаем синхронно рендер дерева — позволяем браузеру не терять каретку
    startTransition(() => setQueryState(q));
  }

  const norm = (s: string) => s.toLowerCase();

  const deferred = useDeferredValue(query);
  const results = useMemo(() => {
    const q = norm(deferred).trim();
    if (!q) {
      // пустой запрос — показываем первые N каждого типа
      const cap = 8;
      const byKind = new Map<SearchKind, number>();
      const out: SearchItem[] = [];
      for (const it of props.items) {
        if (kinds && !kinds.includes(it.kind)) continue;
        const used = byKind.get(it.kind) ?? 0;
        if (used < cap) {
          out.push(it);
          byKind.set(it.kind, used + 1);
        }
      }
      return out;
    }
    // простой и быстрый contains + starts-with буст
    const arr = kinds ? props.items.filter(it => kinds.includes(it.kind)) : props.items;
    const starts: SearchItem[] = [];
    const contains: SearchItem[] = [];
    for (const it of arr) {
      const s = it.q;
      if (s.startsWith(q)) starts.push(it);
      else if (s.includes(q)) contains.push(it);
      if (starts.length + contains.length > 200) break; // отсечка безопасности
    }
    return [...starts, ...contains];
  }, [deferred, props.items, kinds]);

  const value: Ctx = {
    items: props.items,
    query,
    setQuery,
    kinds,
    results,
    filterKinds: setKinds,
  };

  return <SearchCtx.Provider value={value}>{props.children}</SearchCtx.Provider>;
}

export function useSearch() {
  const ctx = useContext(SearchCtx);
  if (!ctx) throw new Error('useSearch must be used within <SearchProvider>');
  return ctx;
}

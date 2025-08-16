/* components/search/UniversalSearchInput.tsx */
'use client';

import { useRef, useState } from 'react';
import { useSearch } from './SearchProvider';
import type { SearchKind, SearchItem } from '@/lib/search/types';

export function UniversalSearchInput(props: {
  placeholder?: string;
  onSelect: (item: SearchItem) => void;
  allowKinds?: ReadonlyArray<SearchKind>; // если надо сузить типы «на лету»
  autoFocus?: boolean;
}) {
  const { query, setQuery, results } = useSearch();
  const [open, setOpen] = useState(false);
  const composingRef = useRef(false);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setOpen(true);
    setQuery(e.target.value);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        className="w-full rounded-xl border px-3 py-2 text-sm"
        placeholder={props.placeholder ?? 'Поиск…'}
        value={query}
        autoFocus={props.autoFocus}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onCompositionStart={() => (composingRef.current = true)}
        onCompositionEnd={() => (composingRef.current = false)}
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border bg-white shadow-lg max-h-80 overflow-auto">
          {results.map((it) => (
            <button
              key={`${it.kind}:${it.id}`}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
              onClick={() => {
                setOpen(false);
                props.onSelect(it);
              }}
            >
              <div className="text-sm">{it.label}</div>
              <div className="text-xs text-gray-500">{badge(it.kind)}{it.hint ? ` • ${it.hint}` : ''}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function badge(kind: SearchKind): string {
  if (kind === 'user') return 'ФИО';
  if (kind === 'group') return 'Группа';
  if (kind === 'subject') return 'Предмет';
  if (kind === 'role') return 'Роль';
  return kind;
}

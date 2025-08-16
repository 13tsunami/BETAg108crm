// app/(app)/inboxtasks/tasks-search-client.tsx
'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export default function InboxTasksSearch(props: { paramKey: 'qt' | 'qu'; placeholder: string }) {
  const { paramKey, placeholder } = props;
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [value, setValue] = React.useState(sp.get(paramKey) ?? '');

  React.useEffect(() => {
    setValue(sp.get(paramKey) ?? '');
  }, [sp, paramKey]);

  const buildUrl = React.useCallback(
    (next: string) => {
      const p = new URLSearchParams(sp.toString());
      if (next && next.trim() !== '') p.set(paramKey, next);
      else p.delete(paramKey);
      const qs = p.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [sp, pathname, paramKey],
  );

  const tRef = React.useRef<number | null>(null);
  function scheduleDebounced(next: string) {
    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = window.setTimeout(() => {
      router.replace(buildUrl(next), { scroll: false });
    }, 350);
  }
  function applyImmediate(next: string) {
    if (tRef.current) { window.clearTimeout(tRef.current); tRef.current = null; }
    router.replace(buildUrl(next), { scroll: false });
  }

  return (
    <input
      value={value}
      onChange={(e) => { const v = e.target.value; setValue(v); scheduleDebounced(v); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') applyImmediate(value);
        if (e.key === 'Escape') { setValue(''); applyImmediate(''); }
      }}
      onBlur={() => applyImmediate(value)}
      placeholder={placeholder}
      style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 10 }}
    />
  );
}

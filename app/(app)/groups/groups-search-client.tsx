'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type UrlSearchBoxProps = {
  paramKey: 'qu' | 'qg' | 'qs';
  placeholder: string;
};

export default function UrlSearchBox(props: UrlSearchBoxProps) {
  const { paramKey, placeholder } = props;
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const initial = sp.get(paramKey) ?? '';
  const [value, setValue] = React.useState(initial);

  // Синхронизация когда меняется URL извне
  React.useEffect(() => {
    const cur = sp.get(paramKey) ?? '';
    setValue(cur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, paramKey]);

  const buildUrl = React.useCallback(
    (next: string) => {
      const p = new URLSearchParams(sp.toString());
      if (next && next.trim() !== '') p.set(paramKey, next);
      else p.delete(paramKey);
      return `${pathname}?${p.toString()}`;
    },
    [sp, pathname, paramKey],
  );

  // Дебаунс обновления URL во время ввода
  const tRef = React.useRef<number | null>(null);
  function scheduleDebounced(next: string) {
    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = window.setTimeout(() => {
      router.replace(buildUrl(next), { scroll: false });
    }, 350);
  }

  function applyImmediate(next: string) {
    if (tRef.current) {
      window.clearTimeout(tRef.current);
      tRef.current = null;
    }
    router.replace(buildUrl(next), { scroll: false });
  }

  return (
    <div style={{ marginTop: 8 }}>
      <input
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          scheduleDebounced(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') applyImmediate(value);
          if (e.key === 'Escape') {
            setValue('');
            applyImmediate('');
          }
        }}
        onBlur={() => applyImmediate(value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '8px 10px',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
        }}
      />
    </div>
  );
}

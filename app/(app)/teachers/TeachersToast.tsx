'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const INTERNAL = new Set(['NEXT_REDIRECT', 'NEXT_NOT_FOUND']);

export default function TeachersToast() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(true);

  useEffect(() => {
    const okRaw = sp.get('ok');
    const errRaw = sp.get('error');

    if (okRaw && !INTERNAL.has(okRaw)) {
      setOk(true);
      setMsg(decodeSafe(okRaw));
    } else if (errRaw && !INTERNAL.has(errRaw)) {
      setOk(false);
      setMsg('Ошибка: ' + decodeSafe(errRaw));
    } else {
      setMsg(null);
    }

    if (okRaw || errRaw) {
      const t = setTimeout(() => {
        const clean = new URLSearchParams(Array.from(sp.entries()));
        clean.delete('ok'); clean.delete('error');
        router.replace(clean.size ? `${pathname}?${clean.toString()}` : pathname);
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [sp, router, pathname]);

  if (!msg) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        padding: '12px 16px',
        borderRadius: 12,
        background: ok ? '#bbf7d0' : '#fecaca',
        border: `1px solid ${ok ? '#15803d' : '#b91c1c'}`,
        color: ok ? '#064e3b' : '#7f1d1d',
        fontWeight: 600,
        boxShadow: '0 4px 12px rgba(0,0,0,.15)',
        zIndex: 10000,
      }}
    >
      {ok ? `Готово: ${msg}` : msg}
    </div>
  );
}

function decodeSafe(v: string) {
  try { return decodeURIComponent(v); } catch { return v; }
}

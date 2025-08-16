'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SettingsToast() {
  const params = useSearchParams();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean>(true);

  useEffect(() => {
    const okParam = params.get('ok');
    const errParam = params.get('error');
    if (okParam) {
      setOk(true);
      setMsg('Успешно сохранено');
    } else if (errParam) {
      setOk(false);
      try {
        setMsg(`Ошибка: ${decodeURIComponent(errParam)}`);
      } catch {
        setMsg('Ошибка');
      }
    } else {
      setMsg(null);
    }

    if (okParam || errParam) {
      const t = setTimeout(() => {
        router.replace('/settings');
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [params, router]);

  if (!msg) return null;

  return (
    <div
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
      role="status"
      aria-live="polite"
    >
      {msg}
    </div>
  );
}

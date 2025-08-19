'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export default function Heartbeat({
  action,
  intervalMs = 600_000,     // раз в 10 минут
}: {
  action: (fd: FormData) => Promise<void>;
  intervalMs?: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const path = usePathname();

  useEffect(() => {
    const submit = () => {
      const f = formRef.current;
      if (!f) return;
      // submit без перезагрузки/перехода
      (f as any).requestSubmit ? (f as any).requestSubmit() : f.submit();
    };

    // пульс сразу + при видимости
    submit();
    const onVis = () => { if (document.visibilityState === 'visible') submit(); };

    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') submit();
    }, intervalMs);

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);

    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [intervalMs, path]);

  return (
    <form ref={formRef} action={action} style={{ display: 'none' }}>
      {/* запасной параметр — вдруг захочешь что-то варьировать по текущему пути */}
      <input type="hidden" name="path" value={path || ''} />
    </form>
  );
}

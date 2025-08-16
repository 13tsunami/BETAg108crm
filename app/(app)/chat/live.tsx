'use client';
import { useEffect, useRef, startTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function Live({ uid, activeThreadId }: { uid: string; activeThreadId?: string }) {
  const router = useRouter();
  const esRef = useRef<EventSource | null>(null);
  const last = useRef(0);

  useEffect(() => {
    if (!uid) return;
    let stop = false;

    const doRefresh = (minGap: number) => {
      const now = Date.now();
      if (now - last.current > minGap) {
        last.current = now;
        startTransition(() => router.refresh());
      }
    };

    const connect = () => {
      if (stop) return;
      try { esRef.current?.close(); } catch {}
      const url = `/chat/sse?uid=${encodeURIComponent(uid)}&t=${Date.now()}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onmessage = (e) => {
        let gap = 800;
        try {
          const data = JSON.parse(e.data || '{}') as { type?: string; threadId?: string };
          if (data?.type === 'message' && data.threadId && data.threadId === activeThreadId) {
            gap = 0; // активный диалог — обновляем мгновенно
          } else if (
            data?.type === 'threadCreated' ||
            data?.type === 'threadDeleted' ||
            data?.type === 'read'
          ) {
            gap = 200;
          }
        } catch { gap = 400; }
        doRefresh(gap);
      };

      es.onerror = () => {
        try { es.close(); } catch {}
        if (!stop) setTimeout(connect, 1000);
      };
    };

    connect();

    // мгновенно подтягиваем при возвращении фокуса
    const onVis = () => { if (document.visibilityState === 'visible') doRefresh(0); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      stop = true;
      try { esRef.current?.close(); } catch {}
    };
  }, [router, uid, activeThreadId]);

  return null;
}

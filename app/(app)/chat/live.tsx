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
      const es = new EventSource(url, { withCredentials: false });
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data || '{}') as { type?: string; threadId?: string };
          if (
            data?.type === 'threadCreated' ||
            data?.type === 'threadDeleted' ||
            (data?.type === 'message' && data?.threadId && data.threadId === activeThreadId) ||
            (data?.type === 'read'    && data?.threadId && data.threadId === activeThreadId)
          ) {
            doRefresh(200);
          } else {
            doRefresh(800);
          }
        } catch {
          doRefresh(1200);
        }
      };

      es.onerror = () => {
        try { es.close(); } catch {}
        if (!stop) setTimeout(connect, 1200);
      };
    };

    connect();
    return () => { stop = true; try { esRef.current?.close(); } catch {} };
  }, [router, uid, activeThreadId]);

  return null;
}

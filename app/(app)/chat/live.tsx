'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function Live({ uid, activeThreadId }: { uid: string; activeThreadId?: string }) {
  const router = useRouter();
  const esRef = useRef<EventSource | null>(null);
  const last = useRef(0);

  useEffect(() => {
    let stop = false;

    const connect = () => {
      if (stop) return;
      esRef.current?.close();
      const es = new EventSource(`/chat/sse?uid=${encodeURIComponent(uid)}`);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data || '{}') as { type: string; threadId?: string };
          // мягкий refresh только если это про активный тред либо событие создания/удаления
          if (
            data.type === 'threadCreated' ||
            data.type === 'threadDeleted' ||
            (data.type === 'message' && data.threadId === activeThreadId) ||
            (data.type === 'read'     && data.threadId === activeThreadId)
          ) {
            const now = Date.now();
            if (now - last.current > 250) {
              last.current = now;
              router.refresh();
            }
          } else {
            // для бейджа в сайдбаре тоже можно дернуть редкий refresh
            const now = Date.now();
            if (now - last.current > 900) {
              last.current = now;
              router.refresh();
            }
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        if (!stop) setTimeout(connect, 1200);
      };
    };

    connect();
    return () => { stop = true; esRef.current?.close(); };
  }, [router, uid, activeThreadId]);

  return null;
}

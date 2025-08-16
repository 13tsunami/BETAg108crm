// app/(app)/chat/live.tsx
'use client';
import { useEffect, useRef, startTransition } from 'react';
import { useRouter } from 'next/navigation';

type P =
  | { type: 'message'; threadId: string; at: number; messageId: string; authorId: string; text: string; ts: string }
  | { type: 'messageEdited'; threadId: string; at: number; messageId: string; byId: string; text: string }
  | { type: 'messageDeleted'; threadId: string; at: number; messageId: string; byId: string; scope: 'self' | 'both' }
  | { type: 'read'; threadId: string; at: number }
  | { type: 'threadCreated'; threadId: string; at: number }
  | { type: 'threadDeleted'; threadId: string; at: number; byId: string; byName: string }
  | { type?: string; [k: string]: any };

function emit(name: string, detail: any) {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
}

export default function Live({ uid, activeThreadId }: { uid: string; activeThreadId?: string }) {
  const router = useRouter();
  const esRef = useRef<EventSource | null>(null);
  const last = useRef(0);

  useEffect(() => {
    if (!uid) return;
    let stop = false;

    const softRefresh = (gap: number) => {
      const now = Date.now();
      if (now - last.current > gap) {
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
        let p: P;
        try { p = JSON.parse(e.data || '{}'); } catch { softRefresh(500); return; }

        // мгновенная дорисовка для активного диалога
        if (p.type === 'message' && p.threadId === activeThreadId) {
          emit('chat:message', p);
          softRefresh(400);
          return;
        }
        if (p.type === 'messageEdited' && p.threadId === activeThreadId) {
          emit('chat:messageEdited', p);
          softRefresh(400);
          return;
        }
        if (p.type === 'messageDeleted' && p.threadId === activeThreadId) {
          emit('chat:messageDeleted', p);
          softRefresh(400);
          return;
        }
        if (p.type === 'read' && p.threadId === activeThreadId) {
          emit('chat:read', p);
          softRefresh(600);
          return;
        }

        // удаление треда — если он открыт у пользователя
        if (p.type === 'threadDeleted') {
          if (activeThreadId && p.threadId === activeThreadId) {
            // максимально просто: уводим на список и показываем alert
            startTransition(() => router.replace('/chat'));
            try { alert(`Ваш чат с «${p.byName}» был удалён.`); } catch {}
          }
          softRefresh(200);
          return;
        }

        // прочие случаи — обновляем счётчики/списки
        softRefresh(300);
      };

      es.onerror = () => {
        try { es.close(); } catch {}
        if (!stop) setTimeout(connect, 800);
      };
    };

    connect();
    const onVis = () => { if (document.visibilityState === 'visible') softRefresh(0); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      stop = true;
      try { esRef.current?.close(); } catch {}
    };
  }, [router, uid, activeThreadId]);

  return null;
}

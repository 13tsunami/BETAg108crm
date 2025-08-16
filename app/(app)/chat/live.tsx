//'use client' файл
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
      const es = new EventSource(`/chat/sse?uid=${encodeURIComponent(uid)}&t=${Date.now()}`);
      esRef.current = es;

      es.onmessage = (e) => {
        let p: P;
        try { p = JSON.parse(e.data || '{}'); } catch { softRefresh(500); return; }

        // Активный тред — мгновенная дорисовка без refresh
        if (activeThreadId && p.threadId === activeThreadId) {
          const api = (window as any).__chatApi;
          if (api && api.threadId === activeThreadId) {
            if (p.type === 'message')        { api.push?.(p); return; }
            if (p.type === 'messageEdited')  { api.edit?.(p); return; }
            if (p.type === 'messageDeleted') { api.del?.(p);  return; }
            if (p.type === 'read')           { api.read?.(p); return; }
            if (p.type === 'threadDeleted')  {
              api.onThreadDeleted?.(p);
              startTransition(() => router.replace('/chat'));
              return;
            }
          }
        }

        // Фоновый приход сообщения — мгновенно плюсуем бейдж в сайдбаре
        if (p.type === 'message' && p.authorId !== uid) {
          emit('app:unread-bump', { threadId: p.threadId });
        }

        // Остальное — мягкий refresh для списков/бейджей
        if (p.type === 'threadDeleted' || p.type === 'threadCreated') { softRefresh(150); return; }
        if (p.type === 'message' || p.type === 'messageEdited' || p.type === 'messageDeleted' || p.type === 'read') {
          softRefresh(300); return;
        }
        softRefresh(600);
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

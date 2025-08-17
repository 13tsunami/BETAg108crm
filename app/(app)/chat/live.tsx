'use client';
import { useEffect, useRef, startTransition } from 'react';
import { useRouter } from 'next/navigation';

type P =
  | { type: 'message'; threadId: string; at: number; messageId: string; authorId: string; text: string; ts: string; clientId?: string }
  | { type: 'messageEdited'; threadId: string; at: number; messageId: string; byId: string; text: string }
  | { type: 'messageDeleted'; threadId: string; at: number; messageId: string; byId: string; scope: 'self' | 'both' }
  | { type: 'read'; threadId: string; at: number }
  | { type: 'threadCreated'; threadId: string; at: number }
  | { type: 'threadDeleted'; threadId: string; at: number; byId: string; byName: string }
  | { type?: string; [k: string]: any };

export default function Live({ uid, activeThreadId }: { uid: string; activeThreadId?: string }) {
  const router = useRouter();
  const esRef = useRef<EventSource | null>(null);
  const lastRefresh = useRef(0);
  const refreshTimer = useRef<number | null>(null);

  // буфер событий для активного треда, пока __chatApi не готов
  const pendingRef = useRef<P[]>([]);
  const apiReadyRef = useRef<boolean>(false);

  useEffect(() => {
    if (!uid) return;
    let stop = false;

    const softRefresh = (minGapMs: number) => {
      const run = () => {
        if (stop) return;
        const now = Date.now();
        if (now - lastRefresh.current >= minGapMs) {
          lastRefresh.current = now;
          startTransition(() => router.refresh());
        }
      };
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(run, minGapMs);
    };

    // когда ChatBoxClient зарегистрировал __chatApi — применим накопленные события
   const onApiReady = () => {
  apiReadyRef.current = true;
  const api = (window as any).__chatApi;
  if (!api || api.threadId !== activeThreadId) return;

  const queue = pendingRef.current;
  pendingRef.current = [];

  for (const p of queue) {
    if (p.type === 'message')         api.push?.(p);
    else if (p.type === 'messageEdited')   api.edit?.(p);
    else if (p.type === 'messageDeleted')  api.del?.(p as any);
    else if (p.type === 'read')            api.read?.(p);
    else if (p.type === 'threadDeleted') { api.onThreadDeleted?.(p); startTransition(() => router.replace('/chat')); }
  }
};

    window.addEventListener('chat:api-ready', onApiReady);

    const connect = () => {
      if (stop) return;
      try { esRef.current?.close(); } catch {}
      const es = new EventSource(`/chat/sse?uid=${encodeURIComponent(uid)}&t=${Date.now()}`);
      esRef.current = es;

      es.onmessage = (e) => {
        let p: P;
        try { p = JSON.parse(e.data || '{}'); } catch { return; }

        // точечная обработка активного треда
        if (activeThreadId && p.threadId === activeThreadId) {
          const api = (window as any).__chatApi;

          // если API готово — применяем сразу
          if (api && api.threadId === activeThreadId) {
            if (p.type === 'message')        { api.push?.({ ...p, clientId: (p as any).clientId }); return; }
            if (p.type === 'messageEdited')  { api.edit?.(p); return; }
            if (p.type === 'messageDeleted') { api.del?.(p);  return; }
            if (p.type === 'read')           { api.read?.(p); return; }
            if (p.type === 'threadDeleted')  { api.onThreadDeleted?.(p); startTransition(() => router.replace('/chat')); return; }
          }

          // иначе — складываем событие в буфер и подстраховываемся мягким refresh
          pendingRef.current.push(p);
          if (!apiReadyRef.current) softRefresh(150);
          return;
        }

        // события по другим тредам
        if (p.type === 'message' && p.authorId !== uid) {
          try { window.dispatchEvent(new CustomEvent('app:unread-bump', { detail: { threadId: p.threadId } })); } catch {}
          return; // без refresh — не сбиваем ввод
        }
        if (p.type === 'threadDeleted' || p.type === 'threadCreated') { softRefresh(250); return; }
        if (p.type === 'messageEdited' || p.type === 'messageDeleted' || p.type === 'read') { softRefresh(500); return; }
      };

      es.onerror = () => {
        try { es.close(); } catch {}
        if (!stop) setTimeout(connect, 900);
      };
    };

    connect();

    const onVis = () => {
      if (document.visibilityState === 'visible') softRefresh(0);
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('chat:api-ready', onApiReady);
      stop = true;
      try { esRef.current?.close(); } catch {}
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      pendingRef.current = [];
      apiReadyRef.current = false;
    };
  }, [router, uid, activeThreadId]);

  return null;
}

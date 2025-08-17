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

function isBusyNow(): boolean {
  // глобальный флаг от клиента: ввод/модалка/редактирование
  if (document.documentElement.dataset.chatBusy === '1') return true;
  const ae = document.activeElement;
  const tag = ae?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  if ((ae as HTMLElement | null)?.isContentEditable) return true;
  // открыта модалка?
  if (document.querySelector('[data-chat-modal="1"]')) return true;
  return false;
}

export default function Live({ uid, activeThreadId }: { uid: string; activeThreadId?: string }) {
  const router = useRouter();
  const esRef = useRef<EventSource | null>(null);
  const lastRefresh = useRef(0);
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!uid) return;
    let stop = false;

    const scheduleSoftRefresh = (gapMs: number) => {
      const run = () => {
        if (stop) return;
        if (isBusyNow()) {
          // попробуем позже, когда пользователь «свободен»
          refreshTimer.current = window.setTimeout(run, 800);
          return;
        }
        const now = Date.now();
        if (now - lastRefresh.current > gapMs) {
          lastRefresh.current = now;
          startTransition(() => router.refresh());
        }
      };
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(run, gapMs);
    };

    const connect = () => {
      if (stop) return;
      try { esRef.current?.close(); } catch {}
      const es = new EventSource(`/chat/sse?uid=${encodeURIComponent(uid)}&t=${Date.now()}`);
      esRef.current = es;

      es.onmessage = (e) => {
        let p: P;
        try { p = JSON.parse(e.data || '{}'); } catch { return; }

        // если открыт активный тред — точечные апдейты без refresh
        if (activeThreadId && p.threadId === activeThreadId) {
          const api = (window as any).__chatApi;
          if (api && api.threadId === activeThreadId) {
            if (p.type === 'message')        { api.push?.({ ...p, clientId: (p as any).clientId }); return; }
            if (p.type === 'messageEdited')  { api.edit?.(p); return; }
            if (p.type === 'messageDeleted') { api.del?.(p);  return; }
            if (p.type === 'read')           { api.read?.(p); return; }
            if (p.type === 'threadDeleted')  { api.onThreadDeleted?.(p); startTransition(() => router.replace('/chat')); return; }
          }
          // если API ещё не успел зарегистрироваться — всё равно не рефрешим мгновенно, подождём «праздного» окна
          scheduleSoftRefresh(400);
          return;
        }

        // события по другим тредам:
        if (p.type === 'message' && p.authorId !== uid) {
          try { window.dispatchEvent(new CustomEvent('app:unread-bump', { detail: { threadId: p.threadId } })); } catch {}
          // не рефрешим, чтобы не сбивать ввод
          return;
        }
        if (p.type === 'threadDeleted' || p.type === 'threadCreated') { scheduleSoftRefresh(500); return; }
        if (p.type === 'messageEdited' || p.type === 'messageDeleted' || p.type === 'read') { scheduleSoftRefresh(900); return; }
      };

      es.onerror = () => {
        try { es.close(); } catch {}
        if (!stop) setTimeout(connect, 900);
      };
    };

    connect();

    const onVis = () => {
      // При возврате на вкладку не дергаем refresh, если пользователь занят
      if (document.visibilityState === 'visible' && !isBusyNow()) {
        scheduleSoftRefresh(0);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      stop = true;
      try { esRef.current?.close(); } catch {}
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, [router, uid, activeThreadId]);

  return null;
}

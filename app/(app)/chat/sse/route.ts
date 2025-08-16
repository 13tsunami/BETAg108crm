// app/(app)/chat/sse/route.ts
import broker, { type EventPayload } from './broker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',     // Nginx
    'Keep-Alive': 'timeout=120',   // некоторые прокси
  };
}

export function GET(req: Request) {
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid') || '';
  if (!uid) return new Response('missing uid', { status: 400, headers: sseHeaders() });

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();

      const send = (payload: unknown) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // мгновенно «пробиваем» канал
      send({ type: 'hello', at: Date.now() });

      // подписка на брокера
      const unsub = broker.subscribe(uid, (p: EventPayload) => send(p));

      // heartbeat
      const hb = setInterval(() => send({ type: 'ping', at: Date.now() }), 10000);

      const close = () => {
        clearInterval(hb);
        try { unsub(); } catch {}
        try { controller.close(); } catch {}
      };

      // закрытие по аборту
      (req as any).signal?.addEventListener?.('abort', close);
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

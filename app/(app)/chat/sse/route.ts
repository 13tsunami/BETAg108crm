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
    'X-Accel-Buffering': 'no',
    'Keep-Alive': 'timeout=120',
  };
}

export function GET(req: Request) {
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid') || '';
  if (!uid) return new Response('missing uid', { status: 400, headers: sseHeaders() });

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();

      // анти-буферизация: первый чанк >2 КБ + мгновенный retry
      controller.enqueue(enc.encode(`:${' '.repeat(2048)}\n`));
      controller.enqueue(enc.encode(`retry: 0\n`));

      const send = (payload: unknown) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // «пробой» канала
      send({ type: 'hello', at: Date.now() });

      // подписка на пользователя
      const unsub = broker.subscribe(uid, (p: EventPayload) => send(p));

      // heartbeat — не даём каналу уснуть
      const hb = setInterval(() => send({ type: 'ping', at: Date.now() }), 5000);

      const close = () => {
        clearInterval(hb);
        try { unsub(); } catch {}
        try { controller.close(); } catch {}
      };

      (req as any).signal?.addEventListener?.('abort', close);
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

// app/(app)/chat/sse/route.ts
import broker, { type EventPayload } from './broker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',       // для Nginx
    'Keep-Alive': 'timeout=120',     // для некоторых прокси
  };
}

export function GET(req: Request) {
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid') || '';
  if (!uid) return new Response('missing uid', { status: 400, headers: sseHeaders() });

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();

      const push = (payload: EventPayload | { type: 'ping'; at: number }) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // открыть поток сразу
      push({ type: 'ping', at: Date.now() });

      // подписка
      const unsub = broker.subscribe(uid, (p) => push(p));

      // heartbeat
      const hb = setInterval(() => push({ type: 'ping', at: Date.now() }), 15000);

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

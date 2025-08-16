// app/(app)/chat/sse/route.ts
import broker, { type EventPayload } from './broker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  };
}

export function GET(req: Request) {
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid') ?? '';
  if (!uid) return new Response('missing uid', { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (p: EventPayload) => {
        try {
          const line = `data: ${JSON.stringify(p)}\n\n`;
          controller.enqueue(enc.encode(line));
        } catch {}
      };
      const unsub = broker.subscribe(uid, send);

      // «приветственный» пинг
      send({ type: 'read', threadId: '', at: Date.now() });

      // heartbeat
      const hb = setInterval(() => {
        try { controller.enqueue(enc.encode(':hb\n\n')); } catch {}
      }, 15000);

      const cancel = () => {
        clearInterval(hb);
        try { unsub(); } catch {}
        try { controller.close(); } catch {}
      };

      // прерывание соединения
      (req as any).signal?.addEventListener?.('abort', cancel);
    },
    cancel() {},
  });

  return new Response(stream, { headers: sseHeaders() });
}

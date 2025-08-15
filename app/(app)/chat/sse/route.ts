// app/(app)/chat/sse/route.ts
import broker, { type EventPayload } from './broker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get('uid') ?? '';
  if (!uid) return new Response('Missing uid', { status: 400 });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();

      const send = (payload: EventPayload) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // начальные параметры реконнекта
      controller.enqueue(enc.encode(`retry: 3000\n\n`));

      // подписка на брокер
      const unsubscribe = broker.subscribe(uid, send);

      // heartbeat, чтобы соединение не засыпало
      const heartbeat = setInterval(() => {
        controller.enqueue(enc.encode(`: ping\n\n`)); // комментарий по SSE
      }, 15000);

      const close = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try { controller.close(); } catch {}
      };

      // закрыть при обрыве со стороны клиента
      const signal = (req as any).signal as AbortSignal | undefined;
      signal?.addEventListener('abort', close);
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

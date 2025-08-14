// app/api/chat/sse/user/[id]/route.ts
import type { NextRequest } from "next/server";
import { subscribeUser, unsubscribeUser } from "../../../_bus";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = params.id;

  const stream = new ReadableStream({
    start(controller) {
      subscribeUser(userId, controller);
      try {
        controller.enqueue(`event: push\ndata: ${JSON.stringify({ type: "hello", at: Date.now() })}\n\n`);
      } catch {}
      const ping = setInterval(() => {
        try { controller.enqueue(`: ping\n\n`); } catch { clearInterval(ping); }
      }, 25000);
      // @ts-ignore
      controller._onclose = () => {
        clearInterval(ping);
        unsubscribeUser(userId, controller);
        try { controller.close(); } catch {}
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

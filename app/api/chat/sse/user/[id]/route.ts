export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import type { NextRequest } from "next/server";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return new Response("missing id", { status: 400 });

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(`event: push\ndata: ${JSON.stringify(payload)}\n\n`);

      send({ type: "hello", at: Date.now() });

      const ping = setInterval(() => {
        try { controller.enqueue(`: ping\n\n`); } catch {}
      }, 25000);

      const tick = setInterval(() => {
        send({ type: "thread-updated", at: Date.now() });
      }, 45000);

      return () => {
        clearInterval(ping);
        clearInterval(tick);
        try { controller.close(); } catch {}
      };
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      connection: "keep-alive"
    }
  });
}

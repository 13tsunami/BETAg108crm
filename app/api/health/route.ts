export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(JSON.stringify({ ok: true, at: Date.now() }), {
    headers: { "content-type": "application/json" }
  });
}

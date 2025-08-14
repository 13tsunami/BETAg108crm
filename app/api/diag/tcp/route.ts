// app/api/diag/tcp/route.ts
import { NextResponse } from "next/server";
import tls from "node:tls";

export const runtime = "nodejs";
export const preferredRegion = ["fra1","cdg1","arn1"];

function getHost(url?: string|null) {
  if (!url) return null;
  try { return new URL(url).host.split(":")[0]; } catch { return null; }
}

export async function GET() {
  const preferDirect = process.env.FORCE_DIRECT_URL === "1";
  const sel = preferDirect
    ? (process.env.DIRECT_URL ?? process.env.DATABASE_URL)
    : (process.env.DATABASE_URL ?? process.env.DIRECT_URL);

  const host = getHost(sel);
  const port = 5432;
  if (!host) return NextResponse.json({ ok:false, error:"no host parsed" }, { status: 500 });

  const res = await new Promise<{ok:boolean; info?:string; error?:string}>((resolve) => {
    const s = tls.connect({ host, port, servername: host, timeout: 8000 }, () => {
      s.end(); resolve({ ok: true, info: "tls connect success" });
    });
    s.on("error", (e) => resolve({ ok: false, error: String((e as any)?.message || e) }));
    s.on("timeout", () => { s.destroy(new Error("timeout")); });
  });

  return NextResponse.json({
    ok: res.ok, info: res.info, error: res.error,
    host, port, preferDirect,
    vercelRegion: process.env.VERCEL_REGION ?? null,
  }, { status: res.ok ? 200 : 500 });
}

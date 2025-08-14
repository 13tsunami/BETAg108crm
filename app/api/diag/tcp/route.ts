import { NextRequest, NextResponse } from "next/server";
import tls from "node:tls";
import dns from "node:dns/promises";

export const runtime = "nodejs";
export const preferredRegion = ["fra1","cdg1","arn1"];

function getHostFromUrl(url?: string|null) {
  if (!url) return null;
  try { return new URL(url).host.split(":")[0]; } catch { return null; }
}

export async function GET(req: NextRequest) {
  const preferDirect = process.env.FORCE_DIRECT_URL === "1";
  const sel = preferDirect
    ? (process.env.DIRECT_URL ?? process.env.DATABASE_URL)
    : (process.env.DATABASE_URL ?? process.env.DIRECT_URL);

  const host = getHostFromUrl(sel);
  const port = 5432;

  if (!host) {
    return NextResponse.json({ ok:false, error:"no host resolved from env" }, { status: 500 });
  }

  try {
    const addrs = await dns.lookup(host, { all: true });
    const ips = addrs.map(a => `${a.address}/${a.family}`);
    const res = await new Promise<{ok:boolean; info?:string; error?:string}>((resolve) => {
      const socket = tls.connect({ host, port, servername: host, timeout: 8000 }, () => {
        socket.end();
        resolve({ ok: true, info: "tls connect success" });
      });
      socket.on("error", (e) => resolve({ ok: false, error: String(e.message||e) }));
      socket.on("timeout", () => {
        socket.destroy(new Error("timeout"));
      });
    });

    return NextResponse.json({
      ok: res.ok,
      info: res.info,
      error: res.error,
      resolved: { host, ips, port },
      preferDirect,
    }, { status: res.ok ? 200 : 500 });

  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message||String(e), host, port }, { status: 500 });
  }
}

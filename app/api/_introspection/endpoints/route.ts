// app/api/_introspection/endpoints/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

function deny(msg = "forbidden") {
  return NextResponse.json({ ok: false, error: msg }, { status: 403 });
}

function fsToHttpSegment(seg: string) {
  if (/^\[\[\.\.\.(.+)\]\]$/.test(seg)) return ":" + RegExp.$1 + "*?";
  if (/^\[\.\.\.(.+)\]$/.test(seg)) return ":" + RegExp.$1 + "*";
  if (/^\[(.+)\]$/.test(seg)) return ":" + RegExp.$1;
  return seg;
}

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.isFile() && e.name === "route.ts") out.push(full);
  }
  return out;
}

async function readMethods(filePath: string): Promise<string[]> {
  const src = await fs.readFile(filePath, "utf8");
  const re = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;
  const methods = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) methods.add(m[1]);
  return [...methods].sort();
}

export async function GET(req: Request) {
  const key = req.headers.get("x-admin-key") ?? "";
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return deny();

  const root = process.cwd();
  const apiDir = path.join(root, "app", "api");
  try {
    const files = await walk(apiDir);
    const items = await Promise.all(
      files.map(async (f) => {
        const rel = path.relative(apiDir, path.dirname(f));
        const parts = rel.split(path.sep).filter(Boolean).map(fsToHttpSegment);
        const route = "/api" + (parts.length ? "/" + parts.join("/") : "");
        const methods = await readMethods(f);
        return { route, methods };
      })
    );
    items.sort((a, b) => a.route.localeCompare(b.route));
    return NextResponse.json({ ok: true, endpoints: items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "internal error" }, { status: 500 });
  }
}

// scripts/list-endpoints.mjs
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, "app", "api");

function fsToHttpSegment(seg) {
  // [id] -> :id
  // [...slug] -> :slug*
  // [[...slug]] -> :slug*?
  if (/^\[\[\.\.\.(.+)\]\]$/.test(seg)) return ":" + RegExp.$1 + "*?";
  if (/^\[\.\.\.(.+)\]$/.test(seg)) return ":" + RegExp.$1 + "*";
  if (/^\[(.+)\]$/.test(seg)) return ":" + RegExp.$1;
  return seg;
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (e.isFile() && e.name === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

async function readMethods(filePath) {
  const src = await fs.readFile(filePath, "utf8");
  const re = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;
  const methods = new Set();
  let m;
  while ((m = re.exec(src))) methods.add(m[1]);
  return [...methods].sort();
}

function toRoute(filePath) {
  const rel = path.relative(API_DIR, path.dirname(filePath));
  const parts = rel.split(path.sep).filter(Boolean).map(fsToHttpSegment);
  const route = "/api" + (parts.length ? "/" + parts.join("/") : "");
  return route;
}

const results = [];

(async () => {
  try {
    const files = await walk(API_DIR);
    for (const f of files) {
      const route = toRoute(f);
      const methods = await readMethods(f);
      results.push({ route, methods });
    }
    results.sort((a, b) => a.route.localeCompare(b.route));
    const outDir = path.join(ROOT, ".introspection");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "endpoints.json"), JSON.stringify(results, null, 2), "utf8");

    console.log("Found API endpoints:");
    for (const r of results) {
      console.log(`${r.route}  [${r.methods.join(", ")}]`);
    }
    console.log("\nSaved to .introspection/endpoints.json");
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();

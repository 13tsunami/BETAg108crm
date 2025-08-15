// lib/dbInfo.ts
export function getDbInfo() {
  const url = process.env.DATABASE_URL || "";
  try {
    const u = new URL(url);
    const host = u.hostname;       // ep-summer-frog-...neon.tech
    const database = u.pathname.replace(/^\//, "") || "";
    const isPgBouncer = /pgbouncer=true/i.test(u.search);
    return { host, database, isPgBouncer, raw: url };
  } catch {
    return { host: "", database: "", isPgBouncer: false, raw: url };
  }
}

export function maskUrl(url: string) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    if (u.username) u.username = "***";
    return u.toString();
  } catch {
    return url;
  }
}

// app/api/_utils.ts
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

type H = Record<string, string>;

function noStore(): H {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  };
}

export function json(data: any, init: ResponseInit = {}) {
  return NextResponse.json(data, { ...init, headers: { ...noStore(), ...(init.headers ?? {}) } });
}
export function badRequest(message = "Bad Request") {
  return NextResponse.json({ error: message }, { status: 400, headers: noStore() });
}
export function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401, headers: noStore() });
}
export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403, headers: noStore() });
}
export function serverError(message = "Internal Server Error") {
  return NextResponse.json({ error: message }, { status: 500, headers: noStore() });
}

export async function readJson<T = any>(req: NextRequest): Promise<T> {
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return {} as T;
  try { return (await req.json()) as T; } catch { return {} as T; }
}

/**
 * ЛЁГКИЙ синхронный способ: читаем ТОЛЬКО заголовок X-User-Id.
 * Опасный fallback на cookie uid УДАЛЁН — это и фиксит «Евжика».
 */
export function getUserId(req: NextRequest): string | null {
  const h = req.headers.get("x-user-id") || req.headers.get("X-User-Id");
  return h && h.trim() ? h.trim() : null;
}

/**
 * Надёжный способ: берём id из next-auth JWT (если ручке ок быть async).
 */
export async function currentUserId(req: NextRequest): Promise<string | null> {
  try {
    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
    const token = await getToken({ req, secret, raw: false });
    if (!token) return null;
    const id =
      (token as any).uid ??
      (token as any).id ??
      (typeof token.sub === "string" ? token.sub : null);
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

/**
 * Удобный гард: сначала JWT, если нет — X-User-Id, иначе 401.
 * Используй в новых/чувствительных ручках.
 */
export async function requireUserId(req: NextRequest): Promise<string> {
  const fromJwt = await currentUserId(req);
  if (fromJwt) return fromJwt;
  const fromHeader = getUserId(req);
  if (fromHeader) return fromHeader;
  throw new Response("Unauthorized", { status: 401 });
}

/** Для SSE */
export function sseHeaders(): H {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    ...noStore(),
  };
}

// app/api/chat/threads/[id]/read/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<Record<string, string>> };

function requireUserId(req: NextRequest): string {
  const uid = req.headers.get("x-user-id");
  if (!uid) throw new Error("Unauthorized");
  return uid;
}

/**
 * GET /api/chat/threads/[id]/read
 * Возвращает информацию о прочтении. Пока в схеме нет таблицы «прочитано»,
 * возвращаем заглушки без крашей.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id: threadId } = await ctx.params;
    const meId = requireUserId(req);

    const t = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { id: true, aId: true, bId: true, lastMessageAt: true },
    });
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (t.aId !== meId && t.bId !== meId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Так как таблицы прочтений нет — отдаём заглушку
    return NextResponse.json(
      {
        my: null,
        peer: null,
        lastMessageAt: t.lastMessageAt ?? null,
      },
      { status: 200 },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

/**
 * PUT /api/chat/threads/[id]/read
 * Пометить тред как прочитанный текущим пользователем.
 * В текущей схеме БД места для хранения нет, делаем no-op, чтобы фронт не падал.
 */
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id: threadId } = await ctx.params;
    const meId = requireUserId(req);

    const t = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { id: true, aId: true, bId: true },
    });
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (t.aId !== meId && t.bId !== meId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // no-op: здесь бы мы писали отметку прочтения в таблицу,
    // но её нет в текущей схеме. Возвращаем 200 OK.
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

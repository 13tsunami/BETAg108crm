// app/api/chat/threads/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function looksLikeUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export async function GET(req: NextRequest) {
  try {
    const rawId = req.headers.get("x-user-id") ?? "";
    const rawUsername = req.headers.get("x-user-username") ?? "";

    if (!rawId && !rawUsername) return jsonError(401, "x-user-id or x-user-username is required");

    // 1) пытаемся найти по UUID
    let me = null;
    if (rawId && looksLikeUuid(rawId)) {
      me = await prisma.user.findUnique({ where: { id: rawId }, select: { id: true, lastSeen: true } });
    }
    // 2) если не нашли — пробуем по username (из любого заголовка)
    if (!me) {
      const uname = rawUsername || rawId;
      if (uname) {
        me = await prisma.user.findUnique({ where: { username: uname }, select: { id: true, lastSeen: true } });
      }
    }
    if (!me) return jsonError(404, "user not found");

    const meId = me.id;
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = Math.min(Math.max(Number(limitParam || 50), 1), 200);

    const threads = await prisma.thread.findMany({
      where: { OR: [{ aId: meId }, { bId: meId }] },
      orderBy: [{ lastMessageAt: "desc" }, { id: "asc" }],
      take: limit,
      include: {
        a: { select: { id: true, name: true, role: true, avatarUrl: true } },
        b: { select: { id: true, name: true, role: true, avatarUrl: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, createdAt: true, text: true, authorId: true },
        },
      },
    });

    const threadIds = threads.map(t => t.id);
    if (threadIds.length === 0) {
      return NextResponse.json({ ok: true, threads: [] });
    }

    const lastSeen = me.lastSeen ?? new Date(0);
    const unreadGrouped = await prisma.message.groupBy({
      by: ["threadId"],
      where: {
        threadId: { in: threadIds },
        createdAt: { gt: lastSeen },
        NOT: { authorId: meId },
      },
      _count: { _all: true },
    });

    const unreadMap = new Map<string, number>();
    for (const row of unreadGrouped) unreadMap.set(row.threadId, row._count._all);

    const result = threads.map(t => {
      const last = t.messages[0] ?? null;
      const peer =
        t.aId === meId
          ? t.b && { id: t.b.id, name: t.b.name, role: t.b.role, avatarUrl: t.b.avatarUrl }
          : t.a && { id: t.a.id, name: t.a.name, role: t.a.role, avatarUrl: t.a.avatarUrl };

      return {
        id: t.id,
        title: t.title,
        aId: t.aId, bId: t.bId,
        lastMessageAt: t.lastMessageAt,
        lastMessageText: t.lastMessageText,
        peer,
        lastMessage: last,
        unreadCount: unreadMap.get(t.id) ?? 0,
        hasUnread: (unreadMap.get(t.id) ?? 0) > 0,
      };
    });

    return NextResponse.json({ ok: true, threads: result });
  } catch (e: any) {
    return jsonError(500, e?.message ?? "internal error");
  }
}

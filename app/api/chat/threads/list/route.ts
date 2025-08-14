// app/api/chat/threads/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as any;
const prisma: PrismaClient = g.prisma ?? new PrismaClient();
if (!g.prisma) g.prisma = prisma;

type ThreadItem = {
  id: string;
  peerId: string;
  peerName: string | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

async function getMeId(req: NextRequest) {
  const hdr = req.headers.get("x-user-id");
  if (hdr && hdr.trim()) return hdr.trim();
  const c = await cookies();
  return c.get("uid")?.value ?? null;
}

export async function GET(req: NextRequest) {
  const meId = await getMeId(req);
  if (!meId) return NextResponse.json([], { status: 200 });

  try {
    // все треды, где я участвую
    const threads = await prisma.thread.findMany({
      where: { OR: [{ aId: meId }, { bId: meId }] },
      select: {
        id: true,
        aId: true,
        bId: true,
        a: { select: { id: true, name: true } },
        b: { select: { id: true, name: true } },
        lastMessageAt: true,
        lastMessageText: true,
      },
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      take: 200,
    });

    if (threads.length === 0) return NextResponse.json([], { status: 200 });

    const ids = threads.map(t => t.id);

    // мои отметки прочтения по всем тредам разом
    const reads = await prisma.chatRead.findMany({
      where: { userId: meId, threadId: { in: ids } },
      select: { threadId: true, lastReadAt: true },
    });
    const readMap = new Map(reads.map(r => [r.threadId, r.lastReadAt]));

    const items: ThreadItem[] = [];

    for (const t of threads) {
      const iAmA = t.aId === meId;
      const peerUser = iAmA ? t.b : t.a;
      const peerId = (peerUser?.id ?? null) || `unknown:${t.id}`;
      const peerName = peerUser?.name ?? null;

      // last message: берём служебные поля, иначе — из Messages
      let lastMessageAt = t.lastMessageAt ?? null;
      let lastMessageText = t.lastMessageText ?? null;
      if (!lastMessageAt) {
        const last = await prisma.message.findFirst({
          where: { threadId: t.id },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, text: true },
        });
        lastMessageAt = last?.createdAt ?? null;
        lastMessageText = last?.text ?? null;
      }

      // ВАЖНО: считаем только входящие (authorId != meId)
      const myReadAt = readMap.get(t.id) ?? null;
      const unreadCount = await prisma.message.count({
        where: {
          threadId: t.id,
          NOT: { authorId: meId },
          ...(myReadAt ? { createdAt: { gt: myReadAt } } : {}),
        },
      });

      items.push({
        id: t.id,
        peerId,
        peerName,
        lastMessageAt: lastMessageAt ? lastMessageAt.toISOString() : null,
        lastMessageText: lastMessageText ?? null,
        unreadCount,
      });
    }

    // cортируем по последнему сообщению (безопасно, если где-то null)
    items.sort((a, b) => {
      const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
      const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
      return tb - ta;
    });

    // отдаём именно массив (как ожидает фронт)
    return NextResponse.json(items, { status: 200 });
  } catch (e) {
    console.error("threads/list GET error:", e);
    return NextResponse.json([], { status: 200 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

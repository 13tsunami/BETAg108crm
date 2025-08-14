// app/api/chat/threads/[id]/read/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as any;
const prisma: PrismaClient = g.prisma ?? new PrismaClient();
if (!g.prisma) g.prisma = prisma;

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

async function getMeId(req: NextRequest) {
  const hdr = req.headers.get("x-user-id");
  if (hdr && typeof hdr === "string" && hdr.trim()) return hdr.trim();
  const c = await cookies();
  return c.get("uid")?.value ?? null;
}

// GET — страница ожидает { myReadAt, peerReadAt }
export async function GET(req: NextRequest, { params }: { params: { id?: string } }) {
  const threadId = params?.id;
  if (!threadId) return bad("threadId is required", 400);

  const meId = await getMeId(req);
  if (!meId) return bad("Not authenticated (user id missing)", 401);

  try {
    const t = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { aId: true, bId: true },
    });
    if (!t) return NextResponse.json({ myReadAt: null, peerReadAt: null });

    const peerId = t.aId === meId ? t.bId : t.bId === meId ? t.aId : null;

    const [my, peer] = await Promise.all([
      prisma.chatRead.findUnique({ where: { threadId_userId: { threadId, userId: meId } }, select: { lastReadAt: true } }),
      peerId
        ? prisma.chatRead.findUnique({ where: { threadId_userId: { threadId, userId: peerId } }, select: { lastReadAt: true } })
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      myReadAt: my?.lastReadAt?.toISOString() ?? null,
      peerReadAt: peer?.lastReadAt?.toISOString() ?? null,
    });
  } catch (e) {
    console.error("thread read GET error:", e);
    return NextResponse.json({ myReadAt: null, peerReadAt: null });
  }
}

// POST — пометить тред прочитанным для меня
export async function POST(req: NextRequest, { params }: { params: { id?: string } }) {
  const threadId = params?.id;
  if (!threadId) return bad("threadId is required", 400);

  const meId = await getMeId(req);
  if (!meId) return bad("Not authenticated (user id missing)", 401);

  try {
    await prisma.chatRead.upsert({
      where: { threadId_userId: { threadId, userId: meId } },
      create: { threadId, userId: meId, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("thread read POST error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

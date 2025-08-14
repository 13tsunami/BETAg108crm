// app/api/chat/threads/ensure/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

function uid(req: NextRequest) {
  const v = req.headers.get("x-user-id");
  if (!v) throw new Error("Unauthorized");
  return String(v);
}

export async function POST(req: NextRequest) {
  try {
    const me = uid(req);
    const body = await req.json().catch(() => ({} as any));
    const other: string | undefined = body.otherUserId;
    if (!other) return NextResponse.json({ error: "otherUserId required" }, { status: 400 });
    if (other === me) return NextResponse.json({ error: "cannot chat with self" }, { status: 400 });

    const [aId, bId] = [me, other].sort((x, y) => (x < y ? -1 : 1));

    let t = await prisma.thread.findFirst({ where: { aId, bId } });
    if (!t) {
      t = await prisma.thread.create({
        data: {
          aId, bId,
          title: "Direct",
          lastMessageAt: null,
          lastMessageText: null,
        },
      });
    }
    return NextResponse.json({ threadId: t.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

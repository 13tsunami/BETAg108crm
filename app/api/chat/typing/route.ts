// app/api/chat/typing/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pushTyping } from "../_bus";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const ids: string[] = body.toUserIds ?? (body.toUserId ? [body.toUserId] : []);
  const threadId: string = body.threadId;
  if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });

  pushTyping(ids, threadId);
  return NextResponse.json({ ok: true });
}

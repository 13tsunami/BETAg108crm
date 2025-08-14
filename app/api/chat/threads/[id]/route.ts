// app/api/chat/threads/[id]/route.ts
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
function ok(data: any = { ok: true }, status = 200) {
  return NextResponse.json(data, { status });
}

async function getMeId(req: NextRequest) {
  // СЃРЅР°С‡Р°Р»Р° Р·Р°РіРѕР»РѕРІРѕРє (СЃС‚СЂР°РЅРёС†Р° РµРіРѕ СѓР¶Рµ С€Р»С‘С‚), РёРЅР°С‡Рµ cookie uid
  const hdr = req.headers.get("x-user-id");
  if (hdr && hdr.trim()) return hdr.trim();
  const c = await cookies();
  return c.get("uid")?.value ?? null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  const id = id;
  if (!id) return bad("id is required", 400);

  try {
    const t = await prisma.thread.findUnique({
      where: { id },
      include: { a: true, b: true },
    });
    if (!t) return bad("Thread not found", 404);

    const shaped = {
      id: t.id,
      a: t.a ? { id: t.a.id, name: t.a.name, avatarUrl: t.a.avatarUrl ?? null } : null,
      b: t.b ? { id: t.b.id, name: t.b.name, avatarUrl: t.b.avatarUrl ?? null } : null,
      lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
      lastMessageText: t.lastMessageText ?? null,
    };
    return ok({ ok: true, thread: shaped });
  } catch (e) {
    console.error("thread GET error:", e);
    return bad("Internal error", 500);
  }
}

/**
 * РЈРґР°Р»РµРЅРёРµ/СЃРєСЂС‹С‚РёРµ РґРёР°Р»РѕРіР°
 * DELETE /api/chat/threads/:id?scope=me|both
 *  - scope=me   : СЃРєСЂС‹С‚СЊ РґРёР°Р»РѕРі РґР»СЏ РјРµРЅСЏ (aId/bId -> null, СѓРґР°Р»РёС‚СЊ РјРѕРё ChatRead)
 *  - scope=both : СѓРґР°Р»РёС‚СЊ РґР»СЏ РІСЃРµС… (ChatRead + Message + Thread)
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  const id = id;
  if (!id) return bad("id is required", 400);

  const meId = await getMeId(req);
  if (!meId) return bad("Not authenticated", 401);

  const url = new URL(req.url);
  const scope = (url.search(await params).get("scope") ?? "me").toLowerCase();

  try {
    const thread = await prisma.thread.findUnique({
      where: { id },
      select: { id: true, aId: true, bId: true },
    });
    if (!thread) return bad("Thread not found", 404);

    const iAmA = thread.aId === meId;
    const iAmB = thread.bId === meId;
    if (!iAmA && !iAmB) return bad("Forbidden: not a participant", 403);

    if (scope === "both") {
      // РџРѕР»РЅРѕРµ СѓРґР°Р»РµРЅРёРµ вЂ” С‡РёСЃС‚РёРј РІСЃС‘ РІСЂСѓС‡РЅСѓСЋ (РІ СЃС…РµРјРµ Message thread FK Р±РµР· CASCADE)
      await prisma.$transaction(async (tx) => {
        await tx.chatRead.deleteMany({ where: { threadId: id } });
        await tx.message.deleteMany({ where: { threadId: id } });
        await tx.thread.delete({ where: { id } });
      });
      return ok({ ok: true, deleted: "both" });
    }

    // scope=me вЂ” СЃРєСЂС‹С‚СЊ РґР»СЏ РјРµРЅСЏ
    await prisma.$transaction(async (tx) => {
      if (iAmA) {
        await tx.thread.update({ where: { id }, data: { aId: null } });
      } else if (iAmB) {
        await tx.thread.update({ where: { id }, data: { bId: null } });
      }
      // РјРѕРё РѕС‚РјРµС‚РєРё РїСЂРѕС‡С‚РµРЅРёСЏ РјРѕР¶РЅРѕ СѓР±СЂР°С‚СЊ
      await tx.chatRead.deleteMany({ where: { threadId: id, userId: meId } });

      // РµСЃР»Рё РѕР±Р° СѓС‡Р°СЃС‚РЅРёРєР° СѓР¶Рµ null Рё СЃРѕРѕР±С‰РµРЅРёР№ РЅРµС‚ вЂ” РїРѕРґС‡РёСЃС‚РёРј С‚СЂРµРґ
      const t = await tx.thread.findUnique({
        where: { id },
        select: { aId: true, bId: true, messages: { select: { id: true }, take: 1 } },
      });
      if (t && !t.aId && !t.bId && t.messages.length === 0) {
        await tx.thread.delete({ where: { id } });
      }
    });

    return ok({ ok: true, deleted: "me" });
  } catch (e) {
    console.error("thread DELETE error:", e);
    return bad("Internal error", 500);
  }
}








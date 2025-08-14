// app/api/threads/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { requireUserId, badRequest, unauthorized } from "../../../_utils";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

// РЎРїРёСЃРѕРє СЃРѕРѕР±С‰РµРЅРёР№ С‚СЂРµРґР°
export async function GET(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  // РўСЂРµР±СѓРµРј Р°РІС‚РѕСЂРёР·Р°С†РёСЋ (С…РѕС‚СЏ Р±С‹ РїРѕ JWT). Р•СЃР»Рё С…РѕС‡РµС€СЊ, РјРѕР¶РЅРѕ С‚СѓС‚ РµС‰С‘ РїСЂРѕРІРµСЂРёС‚СЊ СѓС‡Р°СЃС‚РёРµ РІ С‚СЂРµРґРµ.
  const uid = await requireUserId(req).catch(() => null);
  if (!uid) return unauthorized();

  const { id } = ctx.params;

  // (РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ) РїСЂРѕРІРµСЂРёС‚СЊ, С‡С‚Рѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ СѓС‡Р°СЃС‚РІСѓРµС‚ РІ С‚СЂРµРґРµ
  // Р•СЃР»Рё Сѓ С‚РµР±СЏ РјРѕРґРµР»СЊ Thread С…СЂР°РЅРёС‚ userAId/userBId вЂ” СЂР°СЃРєРѕРјРјРµРЅС‚РёСЂСѓР№:
  // const thread = await prisma.thread.findUnique({ where: { id } });
  // if (!thread || (thread.userAId !== uid && thread.userBId !== uid)) return forbidden();

  const items = await prisma.message.findMany({
    where: { threadId: id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true } } },
  });

  const data = items.map((m) => ({
    id: m.id,
    text: m.text,
    createdAt: m.createdAt.toISOString(),
    author: {
      id: m.authorId,
      name: m.author?.name ?? null,
    },
  }));

  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

// РћС‚РїСЂР°РІРєР° СЃРѕРѕР±С‰РµРЅРёСЏ РІ С‚СЂРµРґ
export async function POST(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  const uid = await requireUserId(req).catch(() => null);
  if (!uid) return unauthorized();

  const { id } = ctx.params;

  type Body = { text?: string; /* authorId?: string - Р‘РћР›Р¬РЁР• РќР• РРЎРџРћР›Р¬Р—РЈР•Рњ */ };
  let body: Body = {};
  try { body = await req.json(); } catch {}
  const text = (body.text || "").trim();
  if (!text) return badRequest("`text` is required");

  // (РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ) РїСЂРѕРІРµСЂРёС‚СЊ СѓС‡Р°СЃС‚РёРµ РІ С‚СЂРµРґРµ вЂ” РєР°Рє РІ GET (СЃРј. РєРѕРјРјРµРЅС‚Р°СЂРёР№ РІС‹С€Рµ)

  const created = await prisma.message.create({
    data: { text, authorId: uid, threadId: id },
    select: { id: true },
  });

  return NextResponse.json({ id: created.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
}






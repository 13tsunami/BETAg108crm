import type { NextRequest } from "next/server";
// app/api/tasks/[id]/assignees/[userId]/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = (global as any).prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") (global as any).prisma = prisma;

// С‡С‚РѕР±С‹ СЂРѕСѓС‚ РІСЃРµРіРґР° СЂР°Р±РѕС‚Р°Р» РґРёРЅР°РјРёС‡РµСЃРєРё
export const dynamic = "force-dynamic";

type Params = { id: string; userId: string };

function ensureString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  try {
    // 1) РѕСЃРЅРѕРІРЅРѕР№ РїСѓС‚СЊ вЂ” Р±РµСЂС‘Рј РёР· ctx.params
    let id = ensureString((await ctx.params).id);
    let userId = ensureString((await ctx.params).userid);

    // 2) Р·Р°РїР°СЃРЅРѕР№ РїСѓС‚СЊ вЂ” РїР°СЂСЃРёРј РёР· URL, РµСЃР»Рё РїРѕС‡РµРјСѓ-С‚Рѕ params РїСѓСЃС‚С‹Рµ/РєСЂРёРІС‹Рµ
    if (!id || !userId) {
      try {
        const url = new URL(req.url);
        // РѕР¶РёРґР°РµРјС‹Р№ С€Р°Р±Р»РѕРЅ: /api/tasks/:id/assignees/:userId
        const parts = url.pathname.split("/").filter(Boolean);
        // ["api","tasks",":id","assignees",":userId"]
        const idxTasks = parts.indexOf("tasks");
        const idxAss = parts.indexOf("assignees");
        const idFromUrl = idxTasks >= 0 ? parts[idxTasks + 1] : null;
        const userFromUrl = idxAss >= 0 ? parts[idxAss + 1] : null;
        if (!id) id = ensureString(idFromUrl);
        if (!userId) userId = ensureString(userFromUrl);
      } catch { /* ignore */ }
    }

    if (!id || !userId) {
      return NextResponse.json(
        { error: "missing task id or user id" },
        { status: 400 }
      );
    }

    // С‚РµР»Рѕ Р·Р°РїСЂРѕСЃР°: status = "done" | "open"
    const body = await req.json().catch(() => ({}));
    const status: "done" | "open" = body?.status === "done" ? "done" : "open";
    const doneAt = status === "done" ? new Date() : null;

    // СЃРѕР·РґР°С‘Рј Р·Р°РїРёСЃСЊ РёСЃРїРѕР»РЅРёС‚РµР»СЏ, РµСЃР»Рё РµС‘ РµС‰С‘ РЅРµС‚, Р»РёР±Рѕ РѕР±РЅРѕРІР»СЏРµРј СЃС‚Р°С‚СѓСЃ
    const updated = await prisma.taskAssignee.upsert({
      where: { taskId_userId: { taskId: id, userId } },
      update: { status, doneAt },
      create: { taskId: id, userId, status, doneAt },
      select: { id: true, userId: true, status: true, doneAt: true },
    });

    return NextResponse.json({
      ok: true,
      id: updated.id,
      userId: updated.userId,
      status: updated.status,
      doneAt: updated.doneAt ? updated.doneAt.toISOString() : null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "failed" },
      { status: 400 }
    );
  }
}







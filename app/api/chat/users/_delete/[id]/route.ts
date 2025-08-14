// app/api/users/_delete/[id]/route.ts
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  const { id } = await ctx.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "id РѕР±СЏР·Р°С‚РµР»РµРЅ" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  try {
    await prisma.user.delete({ where: { id } });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return new Response(JSON.stringify({ error: "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ" }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    if (e?.code === "P2003") {
      return new Response(JSON.stringify({ error: "РЈРґР°Р»РµРЅРёРµ РЅРµРІРѕР·РјРѕР¶РЅРѕ: РµСЃС‚СЊ СЃРІСЏР·Р°РЅРЅС‹Рµ Р·Р°РїРёСЃРё" }), {
        status: 409,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    return new Response(JSON.stringify({ error: e?.message || "РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}





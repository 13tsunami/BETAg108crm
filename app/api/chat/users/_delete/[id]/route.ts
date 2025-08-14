// app/api/users/_delete/[id]/route.ts
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "id обязателен" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  try {
    await prisma.user.delete({ where: { id } });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return new Response(JSON.stringify({ error: "Пользователь не найден" }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    if (e?.code === "P2003") {
      return new Response(JSON.stringify({ error: "Удаление невозможно: есть связанные записи" }), {
        status: 409,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    return new Response(JSON.stringify({ error: e?.message || "Ошибка удаления" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

// app/api/users/delete/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let id: string | undefined;
  try {
    const body = (await req.json()) as { id?: string } | null;
    id = body?.id;
  } catch {/* игнорируем — ниже отдадим 400 */}

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  }

  try {
    await prisma.user.delete({ where: { id } });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }
    if (e?.code === "P2003") {
      return NextResponse.json({ error: "Удаление невозможно: есть связанные записи" }, { status: 409 });
    }
    return NextResponse.json({ error: e?.message || "Ошибка удаления" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

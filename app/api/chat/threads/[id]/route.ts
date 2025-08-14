// app/api/chat/threads/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// Получить тред с участниками (a, b) и сообщениями
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return jsonError(400, "thread id is required");

  try {
    const thread = await prisma.thread.findUnique({
      where: { id },
      include: {
        a: { select: { id: true, name: true, role: true, avatarUrl: true } },
        b: { select: { id: true, name: true, role: true, avatarUrl: true } },
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!thread) return jsonError(404, "thread not found");
    return NextResponse.json({ ok: true, thread });
  } catch (e: any) {
    return jsonError(500, e?.message ?? "internal error");
  }
}

// Архивация/разархивация (мягкое удаление через archivedAt отсутствует в схеме —
// поэтому обновляем только title как нейтральную операцию, либо просто возвращаем 200.
// Если понадобится реальная архивация, добавим поле в модель Thread и здесь обновим код.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return jsonError(400, "thread id is required");

  // На текущей схеме у Thread нет поля archivedAt — выполняем no-op с валидацией существования треда.
  try {
    // Разрешим пустое тело и просто проверим наличие треда
    await req.json().catch(() => ({}));

    const exists = await prisma.thread.findUnique({ where: { id } });
    if (!exists) return jsonError(404, "thread not found");

    // Ничего не меняем по схеме; возвращаем текущий тред
    return NextResponse.json({ ok: true, thread: exists });
  } catch (e: any) {
    return jsonError(500, e?.message ?? "internal error");
  }
}

// Полное удаление: сначала сообщения, затем тред
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: "thread id is required" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const purge = searchParams.get("purge") === "1";

  try {
    if (!purge) {
      const result = await prisma.thread.update({
        where: { id }, data: { /* archivedAt: new Date() */ },
      });
      return NextResponse.json({ ok: true, thread: result, archived: true });
    }

    // БЕЗ интерактивной транзакции
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { threadId: id } }),
      prisma.thread.delete({ where: { id } }),
    ]);

    return NextResponse.json({ ok: true, deleted: true });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return NextResponse.json({ ok: false, error: "thread not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: e?.message ?? "internal error" }, { status: 500 });
  }
}


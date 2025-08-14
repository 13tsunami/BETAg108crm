// app/api/chat/threads/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Вспомогательный хелпер для ответа об ошибке
function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// Получить тред
export async function GET(
  _req: NextRequest,
  context: { params: { id: string } }
) {
  const id = context.params?.id;
  if (!id) return jsonError(400, "thread id is required");
  try {
    const thread = await prisma.thread.findUnique({
      where: { id },
      include: {
        participants: true,
        lastMessage: true,
      },
    });
    if (!thread) return jsonError(404, "thread not found");
    return NextResponse.json({ ok: true, thread });
  } catch (e: any) {
    return jsonError(500, e?.message ?? "internal error");
  }
}

// Архивация (мягкое удаление)
export async function PATCH(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const id = context.params?.id;
  if (!id) return jsonError(400, "thread id is required");
  try {
    const body = await req.json().catch(() => ({}));
    // Если прямо указали archived = false/true — уважаем это; иначе по умолчанию архивируем
    const archived: boolean = typeof body?.archived === "boolean" ? body.archived : true;

    const result = await prisma.thread.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
    return NextResponse.json({ ok: true, thread: result });
  } catch (e: any) {
    if (e?.code === "P2025") return jsonError(404, "thread not found");
    return jsonError(500, e?.message ?? "internal error");
  }
}

// Полное удаление
export async function DELETE(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const id = context.params?.id;
  if (!id) return jsonError(400, "thread id is required");

  const { searchParams } = new URL(req.url);
  const purge = searchParams.get("purge") === "1";

  try {
    if (!purge) {
      // Без purge выполняем мягкое удаление (архив)
      const result = await prisma.thread.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      return NextResponse.json({ ok: true, thread: result, archived: true });
    }

    // purge=1: полное удаление вручную (каскада в схеме нет)
    await prisma.$transaction(async (tx) => {
      // Удаляем все сообщения треда
      await tx.message.deleteMany({ where: { threadId: id } });

      // Если есть вспомогательные записи (прикрепления, пины и пр.),
      // их тоже чистим здесь — добавьте секции ниже при наличии моделей.
      // Пример:
      // await tx.attachment.deleteMany({ where: { threadId: id } });
      // await tx.threadParticipant.deleteMany({ where: { threadId: id } });

      // Удаляем сам тред
      await tx.thread.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true, deleted: true });
  } catch (e: any) {
    if (e?.code === "P2025") return jsonError(404, "thread not found");
    return jsonError(500, e?.message ?? "internal error");
  }
}

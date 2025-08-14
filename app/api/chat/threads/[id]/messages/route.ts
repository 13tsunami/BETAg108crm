// app/api/threads/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { requireUserId, badRequest, unauthorized } from "../../../_utils";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

// Список сообщений треда
export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  // Требуем авторизацию (хотя бы по JWT). Если хочешь, можно тут ещё проверить участие в треде.
  const uid = await requireUserId(req).catch(() => null);
  if (!uid) return unauthorized();

  const { id } = ctx.params;

  // (опционально) проверить, что пользователь участвует в треде
  // Если у тебя модель Thread хранит userAId/userBId — раскомментируй:
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

// Отправка сообщения в тред
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const uid = await requireUserId(req).catch(() => null);
  if (!uid) return unauthorized();

  const { id } = ctx.params;

  type Body = { text?: string; /* authorId?: string - БОЛЬШЕ НЕ ИСПОЛЬЗУЕМ */ };
  let body: Body = {};
  try { body = await req.json(); } catch {}
  const text = (body.text || "").trim();
  if (!text) return badRequest("`text` is required");

  // (опционально) проверить участие в треде — как в GET (см. комментарий выше)

  const created = await prisma.message.create({
    data: { text, authorId: uid, threadId: id },
    select: { id: true },
  });

  return NextResponse.json({ id: created.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

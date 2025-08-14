// app/api/tasks/[id]/assignees/[userId]/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = (global as any).prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") (global as any).prisma = prisma;

// чтобы роут всегда работал динамически
export const dynamic = "force-dynamic";

type Params = { id: string; userId: string };

function ensureString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function PATCH(req: Request, ctx: { params?: Params } = {}) {
  try {
    // 1) основной путь — берём из ctx.params
    let id = ensureString(ctx?.params?.id);
    let userId = ensureString(ctx?.params?.userId);

    // 2) запасной путь — парсим из URL, если почему-то params пустые/кривые
    if (!id || !userId) {
      try {
        const url = new URL(req.url);
        // ожидаемый шаблон: /api/tasks/:id/assignees/:userId
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

    // тело запроса: status = "done" | "open"
    const body = await req.json().catch(() => ({}));
    const status: "done" | "open" = body?.status === "done" ? "done" : "open";
    const doneAt = status === "done" ? new Date() : null;

    // создаём запись исполнителя, если её ещё нет, либо обновляем статус
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

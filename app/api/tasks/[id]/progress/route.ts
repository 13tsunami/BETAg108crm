// app/api/tasks/[id]/progress/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = (global as any).prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") (global as any).prisma = prisma;

type Ctx = { params: Promise<{ id: string }> };

type AssigneeRow = {
  userId: string;
  status: string;
  doneAt: Date | null;
  user: { id: string; name: string | null } | null;
};

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;

    const list: AssigneeRow[] = await prisma.taskAssignee.findMany({
      where: { taskId: id },
      select: {
        userId: true,
        status: true,
        doneAt: true,
        user: { select: { id: true, name: true } },
      },
    });

    const total = list.length;
    const done = list.filter((a: AssigneeRow) => a.status === "done").length;

    return NextResponse.json({
      ok: true,
      total,
      done,
      open: total - done,
      assignees: list.map((a: AssigneeRow) => ({
        userId: a.userId,
        name: a.user?.name ?? a.userId,
        status: a.status,
        doneAt: a.doneAt ? a.doneAt.toISOString() : null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "failed" }, { status: 500 });
  }
}

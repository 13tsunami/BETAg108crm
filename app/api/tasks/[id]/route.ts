// app/api/tasks/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = (global as any).prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") (global as any).prisma = prisma;

const isBeforeToday = (d: Date) => {
  const z = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const now = new Date();
  return z(d) < z(now);
};

function toDto(t: any) {
  return {
    id: t.id,
    seq: t.seq ?? null,
    title: t.title,
    description: t.description,
    dueDate: t.dueDate.toISOString(),
    hidden: !!t.hidden,
    priority: t.priority,
    createdById: t.createdById ?? null,
    createdBy: t.createdBy ? { id: t.createdBy.id, name: t.createdBy.name } : null,
    assignees: (t.assignees ?? []).map(
      (a: { id: string; userId: string; status: string; doneAt: Date | null; user?: { id: string; name: string | null } | null }) => ({
        id: a.id,
        userId: a.userId,
        status: a.status,
        doneAt: a.doneAt ? a.doneAt.toISOString() : null,
        user: a.user ? { id: a.user.id, name: a.user.name } : null,
      })
    ),
    tags: (t.tags ?? []).map((tt: { id: string; tagId: string; tag?: { name: string } | null }) => ({
      id: tt.id, tagId: tt.tagId, name: tt.tag?.name ?? null,
    })),
  };
}

async function getTaskFull(id: string) {
  return prisma.task.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      assignees: { include: { user: { select: { id: true, name: true } } } },
      tags: { include: { tag: true } },
    },
  });
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const task = await getTaskFull(id);
    if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(toDto(task));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();

    const data: any = {};
    if (typeof body?.title === "string") data.title = body.title;
    if (typeof body?.description === "string") data.description = body.description;
    if (typeof body?.dueDate !== "undefined") {
      if (body.dueDate === null || !body.dueDate || isNaN(Date.parse(body.dueDate))) {
        return NextResponse.json({ error: "dueDate must be valid ISO string" }, { status: 400 });
      }
      const d = new Date(body.dueDate);
      if (isBeforeToday(d)) return NextResponse.json({ error: "dueDate cannot be earlier than today" }, { status: 400 });
      data.dueDate = d;
    }
    if (typeof body?.hidden === "boolean") data.hidden = body.hidden;
    if (typeof body?.priority === "string") data.priority = body.priority;
    if (typeof body?.createdById === "string" || body?.createdById === null) data.createdById = body.createdById;

    // поддержка assigneeUserIds | assignees[] | assignedTo[]
    const idsFromDirect: string[] | null = Array.isArray(body?.assigneeUserIds)
      ? (body.assigneeUserIds as string[]).filter(Boolean)
      : null;
    const idsFromAssignees: string[] | null = Array.isArray(body?.assignees)
      ? (body.assignees.map((x: { userId?: string }) => x?.userId).filter(Boolean) as string[])
      : null;
    const idsFromAssignedTo: string[] | null = Array.isArray(body?.assignedTo)
      ? (body.assignedTo
          .filter((x: { type?: string }) => !x?.type || x.type === "user")
          .map((x: { id?: string }) => x?.id)
          .filter(Boolean) as string[])
      : null;

    const assigneesIn = [idsFromDirect, idsFromAssignees, idsFromAssignedTo].some((x) => Array.isArray(x))
      ? Array.from(new Set([...(idsFromDirect ?? []), ...(idsFromAssignees ?? []), ...(idsFromAssignedTo ?? [])]))
      : null;

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const exists = await tx.task.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw Object.assign(new Error("not found"), { code: "P2025" });

      await tx.task.update({ where: { id }, data });

      if (assigneesIn) {
        const current = await tx.taskAssignee.findMany({ where: { taskId: id }, select: { id: true, userId: true } });
        const currentSet = new Set(current.map((a: { userId: string }) => a.userId));
        const nextSet = new Set(assigneesIn);

        const toRemoveIds = current.filter((a: { id: string; userId: string }) => !nextSet.has(a.userId)).map((a) => a.id);
        if (toRemoveIds.length) await tx.taskAssignee.deleteMany({ where: { id: { in: toRemoveIds } } });

        const toAddRaw = assigneesIn.filter((u: string) => !currentSet.has(u));
        const toAdd = Array.from(new Set(toAddRaw));
        if (toAdd.length) {
          await tx.taskAssignee.createMany({
            data: toAdd.map((u: string) => ({ taskId: id, userId: u, status: "open" })),
          });
        }
      }

      return getTaskFull(id);
    });

    return NextResponse.json(toDto(updated));
  } catch (e: any) {
    const status = e?.code === "P2025" ? 404 : 400;
    return NextResponse.json({ error: e?.message ?? "failed" }, { status });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.taskAssignee.deleteMany({ where: { taskId: id } });
      await tx.taskTag.deleteMany({ where: { taskId: id } });
      await tx.task.delete({ where: { id } });
    });
  } catch (e: any) {
    const status = e?.code === "P2025" ? 404 : 400;
    return NextResponse.json({ error: e?.message ?? "failed" }, { status });
  }
  return NextResponse.json({ ok: true });
}

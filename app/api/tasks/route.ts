// app/api/tasks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = (global as any).prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") (global as any).prisma = prisma;

function err(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// Единый include для задач
const taskInclude = Prisma.validator<Prisma.TaskInclude>()({
  assignees: {
    include: {
      user: { select: { id: true, name: true, role: true, avatarUrl: true } },
    },
  },
  tags: { include: { tag: true } },
});

// Тип задачи с нужными связями
type TaskWithIncludes = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

// DTO под фронт
type TaskDto = {
  id: string;
  title: string;
  description: string;
  dueDate: Date;
  hidden: boolean;
  priority: string;
  assignees: { id: string; name: string; role: string | null; avatarUrl: string | null }[];
  tags: { id: string; name: string }[];
};

// Список задач
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim() || "";
    const limit = Math.min(Math.max(Number(sp.get("limit") || 50), 1), 200);
    const onlyVisible = sp.get("onlyVisible") === "1";

    const where: Prisma.TaskWhereInput = {
      AND: [
        onlyVisible ? { hidden: false } : {},
        q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    const tasks: TaskWithIncludes[] = await prisma.task.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: limit,
      include: taskInclude,
    });

    const result: TaskDto[] = tasks.map((t: TaskWithIncludes): TaskDto => ({
      id: t.id,
      title: t.title,
      description: t.description,
      dueDate: t.dueDate,
      hidden: t.hidden,
      priority: t.priority,
      assignees: t.assignees.map((a) => ({
        id: a.userId,
        name: a.user?.name ?? "",
        role: a.user?.role ?? null,
        avatarUrl: a.user?.avatarUrl ?? null,
      })),
      tags: t.tags.map((tt) => ({ id: tt.tag.id, name: tt.tag.name })),
    }));

    return NextResponse.json({ ok: true, tasks: result });
  } catch (e: any) {
    return err(500, e?.message ?? "internal error");
  }
}

// Создание задачи
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return err(400, "invalid json");
    const title = String(body.title ?? "").trim();
    if (!title) return err(400, "title is required");

    const dueDateRaw = body.dueDate;
    const dueDate =
      typeof dueDateRaw === "string" || dueDateRaw instanceof Date
        ? new Date(dueDateRaw)
        : null;
    if (!dueDate || Number.isNaN(dueDate.getTime())) return err(400, "dueDate is required");

    const description = typeof body.description === "string" ? body.description : "";
    const priority =
      typeof body.priority === "string" && body.priority.trim()
        ? body.priority
        : "normal";
    const hidden = Boolean(body.hidden);
    const assigneeIds: string[] = Array.isArray(body.assigneeIds)
      ? body.assigneeIds.filter((v: unknown) => typeof v === "string") as string[]
      : [];
    const tagNames: string[] = Array.isArray(body.tags)
      ? (body.tags as unknown[])
          .filter((v) => typeof v === "string")
          .map((s) => (s as string).trim())
          .filter(Boolean)
      : [];

    const createdId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let tagLinks: { id: string }[] = [];
      if (tagNames.length > 0) {
        const existing = await tx.tag.findMany({
          where: { name: { in: tagNames } },
          select: { id: true, name: true },
        });
        const existingMap = new Map<string, string>(
          existing.map((t) => [t.name.toLowerCase(), t.id]),
        );
        const toCreate = tagNames.filter((n) => !existingMap.has(n.toLowerCase()));
        if (toCreate.length > 0) {
          await tx.tag.createMany({
            data: toCreate.map((name) => ({ name })),
            skipDuplicates: true,
          });
        }
        const all = await tx.tag.findMany({
          where: { name: { in: tagNames } },
          select: { id: true },
        });
        tagLinks = all.map((t) => ({ id: t.id }));
      }

      const task = await tx.task.create({
        data: { title, description, dueDate, priority, hidden },
        select: { id: true },
      });

      if (assigneeIds.length > 0) {
        await tx.taskAssignee.createMany({
          data: assigneeIds.map((userId) => ({ taskId: task.id, userId })),
          skipDuplicates: true,
        });
      }

      if (tagLinks.length > 0) {
        await tx.taskTag.createMany({
          data: tagLinks.map((t) => ({ taskId: task.id, tagId: t.id })),
          skipDuplicates: true,
        });
      }

      return task.id;
    });

    const full = await prisma.task.findUnique({
      where: { id: createdId },
      include: taskInclude,
    });

    return NextResponse.json({ ok: true, task: full });
  } catch (e: any) {
    return err(500, e?.message ?? "internal error");
  }
}

// Обновление задачи (частичное)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return err(400, "invalid json");
    const id = String((body as any).id ?? "").trim();
    if (!id) return err(400, "id is required");

    const data: Prisma.TaskUpdateInput = {};
    if (typeof (body as any).title === "string") data.title = (body as any).title;
    if (typeof (body as any).description === "string") data.description = (body as any).description;
    if (typeof (body as any).priority === "string") data.priority = (body as any).priority;
    if (typeof (body as any).hidden === "boolean") data.hidden = (body as any).hidden;
    if ((body as any).dueDate) {
      const d = new Date((body as any).dueDate);
      if (Number.isNaN(d.getTime())) return err(400, "invalid dueDate");
      data.dueDate = d;
    }

    const assigneeIds: string[] | undefined = Array.isArray((body as any).assigneeIds)
      ? ((body as any).assigneeIds as unknown[])
          .filter((v) => typeof v === "string") as string[]
      : undefined;

    const tagNames: string[] | undefined = Array.isArray((body as any).tags)
      ? ((body as any).tags as unknown[])
          .filter((v) => typeof v === "string")
          .map((s) => (s as string).trim())
          .filter(Boolean)
      : undefined;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.task.update({ where: { id }, data });

      if (assigneeIds) {
        await tx.taskAssignee.deleteMany({ where: { taskId: id } });
        if (assigneeIds.length > 0) {
          await tx.taskAssignee.createMany({
            data: assigneeIds.map((userId) => ({ taskId: id, userId })),
            skipDuplicates: true,
          });
        }
      }

      if (tagNames) {
        await tx.taskTag.deleteMany({ where: { taskId: id } });
        if (tagNames.length > 0) {
          const existing = await tx.tag.findMany({
            where: { name: { in: tagNames } },
            select: { id: true, name: true },
          });
          const existingMap = new Map<string, string>(
            existing.map((t) => [t.name.toLowerCase(), t.id]),
          );
          const toCreate = tagNames.filter((n) => !existingMap.has(n.toLowerCase()));
          if (toCreate.length > 0) {
            await tx.tag.createMany({
              data: toCreate.map((name) => ({ name })),
              skipDuplicates: true,
            });
          }
          const all = await tx.tag.findMany({
            where: { name: { in: tagNames } },
            select: { id: true },
          });
          if (all.length > 0) {
            await tx.taskTag.createMany({
              data: all.map((t) => ({ taskId: id, tagId: t.id })),
              skipDuplicates: true,
            });
          }
        }
      }
    });

    const full = await prisma.task.findUnique({
      where: { id },
      include: taskInclude,
    });

    if (!full) return err(404, "task not found");
    return NextResponse.json({ ok: true, task: full });
  } catch (e: any) {
    if (e?.code === "P2025") return err(404, "task not found");
    return err(500, e?.message ?? "internal error");
  }
}

// Удаление задачи
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return err(400, "invalid json");
    const id = String((body as any).id ?? "").trim();
    if (!id) return err(400, "id is required");

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.taskAssignee.deleteMany({ where: { taskId: id } });
      await tx.taskTag.deleteMany({ where: { taskId: id } });
      await tx.task.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true, deleted: true });
  } catch (e: any) {
    if (e?.code === "P2025") return err(404, "task not found");
    return err(500, e?.message ?? "internal error");
  }
}

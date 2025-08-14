// app/api/tasks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";

// ✅ НЕ экспортируем prisma из модуля роутов
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (!globalForPrisma.prisma) globalForPrisma.prisma = prisma;

function err(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

const taskInclude = Prisma.validator<Prisma.TaskInclude>()({
  assignees: {
    include: { user: { select: { id: true, name: true, role: true, avatarUrl: true } } },
  },
  tags: { include: { tag: true } },
});
type TaskWithIncludes = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

type TaskDto = {
  id: string; title: string; description: string; dueDate: Date;
  hidden: boolean; priority: string;
  assignees: { id: string; name: string; role: string | null; avatarUrl: string | null }[];
  tags: { id: string; name: string }[];
};

// GET /api/tasks
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim() || "";
    const limit = Math.min(Math.max(Number(sp.get("limit") || 50), 1), 200);
    const onlyVisible = sp.get("onlyVisible") === "1";

    const where: Prisma.TaskWhereInput = {
      AND: [
        onlyVisible ? { hidden: false } : {},
        q ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        } : {},
      ],
    };

    const tasks: TaskWithIncludes[] = await prisma.task.findMany({
      where, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: limit, include: taskInclude,
    });

    const result: TaskDto[] = tasks.map((t) => ({
      id: t.id, title: t.title, description: t.description,
      dueDate: t.dueDate, hidden: t.hidden, priority: t.priority,
      assignees: t.assignees.map(a => ({
        id: a.userId, name: a.user?.name ?? "", role: a.user?.role ?? null, avatarUrl: a.user?.avatarUrl ?? null,
      })),
      tags: t.tags.map(tt => ({ id: tt.tag.id, name: tt.tag.name })),
    }));

    return NextResponse.json({ ok: true, tasks: result });
  } catch (e: any) {
    return err(500, e?.message ?? "internal error");
  }
}

// POST /api/tasks
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return err(400, "invalid json");
    const title = String((body as any).title ?? "").trim();
    if (!title) return err(400, "title is required");

    const dueDateRaw = (body as any).dueDate;
    const dueDate = (typeof dueDateRaw === "string" || dueDateRaw instanceof Date) ? new Date(dueDateRaw) : null;
    if (!dueDate || Number.isNaN(dueDate.getTime())) return err(400, "dueDate is required");

    const description = typeof (body as any).description === "string" ? (body as any).description : "";
    const priority = (typeof (body as any).priority === "string" && (body as any).priority.trim()) ? (body as any).priority : "normal";
    const hidden = Boolean((body as any).hidden);

    const assigneeIds: string[] = Array.isArray((body as any).assigneeIds)
      ? ((body as any).assigneeIds as unknown[]).filter(v => typeof v === "string") as string[]
      : [];
    const tagNames: string[] = Array.isArray((body as any).tags)
      ? ((body as any).tags as unknown[]).filter(v => typeof v === "string").map(s => (s as string).trim()).filter(Boolean)
      : [];

    // 1) гарантируем наличие тегов (без интерактивной транзакции)
    let tagsToLink: { id: string }[] = [];
    if (tagNames.length > 0) {
      const existing = await prisma.tag.findMany({ where: { name: { in: tagNames } }, select: { id: true, name: true } });
      const existingMap = new Map<string, string>(existing.map(t => [t.name.toLowerCase(), t.id]));
      const toCreate = tagNames.filter(n => !existingMap.has(n.toLowerCase()));
      if (toCreate.length > 0) {
        await prisma.tag.createMany({ data: toCreate.map(name => ({ name })), skipDuplicates: true });
      }
      const all = await prisma.tag.findMany({ where: { name: { in: tagNames } }, select: { id: true } });
      tagsToLink = all.map(t => ({ id: t.id }));
    }

    // 2) создаём задачу
    const task = await prisma.task.create({
      data: { title, description, dueDate, priority, hidden },
      select: { id: true },
    });

    // 3) привязываем исполнителей/теги
    if (assigneeIds.length > 0) {
      await prisma.taskAssignee.createMany({
        data: assigneeIds.map(userId => ({ taskId: task.id, userId })),
        skipDuplicates: true,
      });
    }
    if (tagsToLink.length > 0) {
      await prisma.taskTag.createMany({
        data: tagsToLink.map(t => ({ taskId: task.id, tagId: t.id })),
        skipDuplicates: true,
      });
    }

    const full = await prisma.task.findUnique({ where: { id: task.id }, include: taskInclude });
    return NextResponse.json({ ok: true, task: full });
  } catch (e: any) {
    return err(500, e?.message ?? "internal error");
  }
}

// PATCH /api/tasks
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

    await prisma.task.update({ where: { id }, data });

    const assigneeIds: string[] | undefined = Array.isArray((body as any).assigneeIds)
      ? ((body as any).assigneeIds as unknown[]).filter(v => typeof v === "string") as string[]
      : undefined;

    const tagNames: string[] | undefined = Array.isArray((body as any).tags)
      ? ((body as any).tags as unknown[]).filter(v => typeof v === "string").map(s => (s as string).trim()).filter(Boolean)
      : undefined;

    if (assigneeIds) {
      await prisma.taskAssignee.deleteMany({ where: { taskId: id } });
      if (assigneeIds.length > 0) {
        await prisma.taskAssignee.createMany({
          data: assigneeIds.map(userId => ({ taskId: id, userId })),
          skipDuplicates: true,
        });
      }
    }

    if (tagNames) {
      await prisma.taskTag.deleteMany({ where: { taskId: id } });
      if (tagNames.length > 0) {
        const existing = await prisma.tag.findMany({ where: { name: { in: tagNames } }, select: { id: true, name: true } });
        const existingMap = new Map<string, string>(existing.map(t => [t.name.toLowerCase(), t.id]));
        const toCreate = tagNames.filter(n => !existingMap.has(n.toLowerCase()));
        if (toCreate.length > 0) {
          await prisma.tag.createMany({ data: toCreate.map(name => ({ name })), skipDuplicates: true });
        }
        const all = await prisma.tag.findMany({ where: { name: { in: tagNames } }, select: { id: true } });
        if (all.length > 0) {
          await prisma.taskTag.createMany({
            data: all.map(t => ({ taskId: id, tagId: t.id })),
            skipDuplicates: true,
          });
        }
      }
    }

    const full = await prisma.task.findUnique({ where: { id }, include: taskInclude });
    if (!full) return err(404, "task not found");
    return NextResponse.json({ ok: true, task: full });
  } catch (e: any) {
    if (e?.code === "P2025") return err(404, "task not found");
    return err(500, e?.message ?? "internal error");
  }
}

// DELETE /api/tasks
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return err(400, "invalid json");
    const id = String((body as any).id ?? "").trim();
    if (!id) return err(400, "id is required");

    await prisma.$transaction([
      prisma.taskAssignee.deleteMany({ where: { taskId: id } }),
      prisma.taskTag.deleteMany({ where: { taskId: id } }),
      prisma.task.delete({ where: { id } }),
    ]);

    return NextResponse.json({ ok: true, deleted: true });
  } catch (e: any) {
    if (e?.code === "P2025") return err(404, "task not found");
    return err(500, e?.message ?? "internal error");
  }
}

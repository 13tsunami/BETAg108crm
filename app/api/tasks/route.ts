// app/api/tasks/route.ts
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

export async function GET(_req: NextRequest) {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: [{ dueDate: "asc" }, { seq: "asc" }],
      include: {
        createdBy: { select: { id: true, name: true } },
        assignees: { include: { user: { select: { id: true, name: true } } } },
        tags: { include: { tag: true } },
      },
    });
    return NextResponse.json(tasks.map(toDto));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const title: string = body?.title;
    const description: string = body?.description;
    const dueDateRaw: string = body?.dueDate;
    const priority: string = body?.priority ?? "normal";
    const hidden: boolean = !!body?.hidden;
    const createdById: string | null = body?.createdById ?? null;

    if (!title || typeof title !== "string") return NextResponse.json({ error: "title is required" }, { status: 400 });
    if (!description || typeof description !== "string")
      return NextResponse.json({ error: "description is required" }, { status: 400 });
    if (!dueDateRaw || isNaN(Date.parse(dueDateRaw)))
      return NextResponse.json({ error: "dueDate must be valid ISO string" }, { status: 400 });

    const dueDate = new Date(dueDateRaw);
    if (isBeforeToday(dueDate)) {
      return NextResponse.json({ error: "dueDate cannot be earlier than today" }, { status: 400 });
    }

    // поддержка трёх вариантов входа: assigneeUserIds | assignees[] | assignedTo[]
    const idsFromDirect: string[] = Array.isArray(body?.assigneeUserIds)
      ? (body.assigneeUserIds as string[]).filter(Boolean)
      : [];
    const idsFromAssignees: string[] = Array.isArray(body?.assignees)
      ? (body.assignees.map((x: { userId?: string }) => x?.userId).filter(Boolean) as string[])
      : [];
    const idsFromAssignedTo: string[] = Array.isArray(body?.assignedTo)
      ? (body.assignedTo
          .filter((x: { type?: string }) => !x?.type || x.type === "user")
          .map((x: { id?: string }) => x?.id)
          .filter(Boolean) as string[])
      : [];
    const assigneesIn = Array.from(new Set([...idsFromDirect, ...idsFromAssignees, ...idsFromAssignedTo]));

    const tagNamesIn: string[] = Array.isArray(body?.tags)
      ? (body.tags.map((x: string | { name?: string }) => (typeof x === "string" ? x : x?.name)).filter(Boolean) as string[])
      : [];

    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const last = await tx.task.findFirst({ orderBy: { seq: "desc" }, select: { seq: true } });
      const nextSeq = (last?.seq ?? 0) + 1;

      const task = await tx.task.create({
        data: { seq: nextSeq, title, description, dueDate, hidden, priority, createdById },
      });

      if (assigneesIn.length) {
        await tx.taskAssignee.createMany({
          data: assigneesIn.map((uid: string) => ({ taskId: task.id, userId: uid, status: "open" })),
        });
      }

      if (tagNamesIn.length) {
        const existing = await tx.tag.findMany({ where: { name: { in: tagNamesIn } } });
        const known = new Map(existing.map((t: { id: string; name: string }) => [t.name, t.id]));
        for (const name of tagNamesIn) {
          let tagId = known.get(name);
          if (!tagId) {
            const createdTag = await tx.tag.create({ data: { name } });
            tagId = createdTag.id;
            known.set(name, createdTag.id);
          }
          await tx.taskTag.create({ data: { taskId: task.id, tagId } });
        }
      }

      return tx.task.findUnique({
        where: { id: task.id },
        include: {
          createdBy: { select: { id: true, name: true } },
          assignees: { include: { user: { select: { id: true, name: true } } } },
          tags: { include: { tag: true } },
        },
      });
    });

    return NextResponse.json(toDto(created), { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 400 });
  }
}

// app/api/users/[id]/groups/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = (global as any).prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") (global as any).prisma = prisma;

export const dynamic = "force-dynamic";

// GET /api/users/:id/groups?details=1
export async function GET(req: Request, ctx: { params: { id: string } }) {
  const userId = ctx?.params?.id;
  if (!userId) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const url = new URL(req.url);
  const details = url.searchParams.get("details");

  const rows = await prisma.groupMember.findMany({
    where: { userId },
    include: { group: { select: { id: true, name: true } } },
    orderBy: { id: "asc" },
  });

  if (details) {
    const payload = rows.map((r: { group: { id: string; name: string } }) => ({
      id: r.group.id,
      name: r.group.name,
    }));
    return NextResponse.json(payload);
  }

  const names = rows.map((r: { group: { id: string; name: string } }) => r.group.name);
  return NextResponse.json(names);
}

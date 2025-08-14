// app/api/chat/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as any;
const prisma: PrismaClient = g.prisma ?? new PrismaClient();
if (!g.prisma) g.prisma = prisma;

async function getMeId(req: NextRequest) {
  const hdr = req.headers.get("x-user-id");
  if (hdr && hdr.trim()) return hdr.trim();
  const c = await cookies();
  return c.get("uid")?.value ?? null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const meId = await getMeId(req);

  const includeSelf =
    (url.searchParams.get("includeSelf") ?? "").toLowerCase() === "1" ||
    (url.searchParams.get("for") ?? "").toLowerCase() === "tasks";

  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    2000,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "1000", 10) || 1000)
  );

  const where: any = {};
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (!includeSelf && meId) {
    where.id = { not: meId }; // классическое поведение для чатов
  }

  const rows = await prisma.user.findMany({
    where,
    select: { id: true, name: true, role: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: limit,
  });

  return NextResponse.json(rows, { status: 200 });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-User-Id",
    },
  });
}

// app/api/presence/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as any;
const prisma: PrismaClient = g.prisma ?? new PrismaClient();
if (!g.prisma) g.prisma = prisma;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

async function touch() {
  const c = await cookies(); // обязательно await
  const meId = c.get("uid")?.value ?? null;
  if (!meId) return { ok: false, reason: "no uid cookie" };

  try {
    await prisma.user.update({
      where: { id: meId },
      data: { lastSeen: new Date() },
    });
    return { ok: true, meId, now: new Date().toISOString() };
  } catch (e) {
    console.error("presence touch error:", e);
    return { ok: false, reason: "db" };
  }
}

export async function GET(_req: NextRequest)   { return json(await touch(), 200); }
export async function POST(_req: NextRequest)  { return json(await touch(), 200); }
export async function PATCH(_req: NextRequest) { return json(await touch(), 200); }
export async function PUT(_req: NextRequest)   { return json(await touch(), 200); }
export async function HEAD()                   { return new NextResponse(null, { status: 204 }); }

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

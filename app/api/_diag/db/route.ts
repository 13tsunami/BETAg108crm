import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export const preferredRegion = ["fra1","cdg1","arn1"];

export async function GET() {
  try {
    const r = await prisma.$queryRaw`SELECT 1 as ok`;
    return NextResponse.json({ ok: true, result: r });
  } catch (e:any) {
    console.error("DB diag error:", e);
    return NextResponse.json({ ok:false, error: e?.message ?? "db error" }, { status: 500 });
  }
}

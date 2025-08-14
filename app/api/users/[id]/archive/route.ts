// app/api/users/[id]/archive/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id обязателен" }, { status: 400 });

  try {
    const Prisma = await import("@prisma/client");
    const g = globalThis as any;
    const prisma: InstanceType<typeof Prisma.PrismaClient> =
      g.__prisma ?? (g.__prisma = new Prisma.PrismaClient());

    // A: пробуем связью role.connect(slug="archived")
    try {
      try {
        await (prisma as any).role?.upsert?.({
          where: { slug: "archived" },
          update: {},
          create: { slug: "archived", name: "В архиве" },
        });
      } catch {}
      const u = await (prisma as any).user.update({
        where: { id },
        data: { role: { connect: { slug: "archived" } } },
        select: { id: true },
      });
      return NextResponse.json({ ok: true, id: u.id }, { status: 200 });
    } catch (e1: any) {
      // B: строковое поле roleSlug
      try {
        const u = await (prisma as any).user.update({
          where: { id },
          data: { roleSlug: "archived" },
          select: { id: true },
        });
        return NextResponse.json({ ok: true, id: u.id }, { status: 200 });
      } catch (e2: any) {
        // C: строковое поле role
        try {
          const u = await (prisma as any).user.update({
            where: { id },
            data: { role: "archived" },
            select: { id: true },
          });
          return NextResponse.json({ ok: true, id: u.id }, { status: 200 });
        } catch (e3: any) {
          const msg = [e1?.message, e2?.message, e3?.message].filter(Boolean).join(" | ");
          return NextResponse.json({ error: msg || "Не удалось архивировать" }, { status: 500 });
        }
      }
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Сбой архивации" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

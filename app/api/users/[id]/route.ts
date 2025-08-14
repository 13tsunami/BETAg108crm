// app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as any;
const prisma: PrismaClient = g.prisma ?? new PrismaClient();
if (!g.prisma) g.prisma = prisma;

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}
function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

// GET /api/users/:id — получить пользователя
export async function GET(_: NextRequest, { params }: { params: { id?: string } }) {
  const id = params?.id?.trim();
  if (!id) return bad("id is required", 400);

  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) return bad("User not found", 404);

  return ok({
    ok: true,
    user: {
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      phone: u.phone,
      birthday: u.birthday?.toISOString() ?? null,
      classroom: u.classroom ?? null,
      role: u.role ?? null,
      avatarUrl: u.avatarUrl ?? null,
      telegram: u.telegram ?? null,
      about: u.about ?? null,
      notifyEmail: u.notifyEmail,
      notifyTelegram: u.notifyTelegram,
      subjects: u.subjects ?? null,
      methodicalGroups: u.methodicalGroups ?? null,
      lastSeen: u.lastSeen?.toISOString() ?? null,
    },
  });
}

// PATCH /api/users/:id — частичное обновление
export async function PATCH(req: NextRequest, { params }: { params: { id?: string } }) {
  const id = params?.id?.trim();
  if (!id) return bad("id is required", 400);

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON", 400);
  }
  if (!body || typeof body !== "object") return bad("Invalid JSON", 400);

  const normStr = (v: unknown) =>
    typeof v === "string" ? v.trim() : v == null ? null : String(v).trim();
  const optStr = (v: unknown) => {
    const s = normStr(v);
    return s === "" ? null : (s as string | null);
  };
  const boolish = (v: unknown) =>
    typeof v === "boolean"
      ? v
      : typeof v === "string"
        ? ["1", "true", "yes", "on"].includes(v.toLowerCase())
        : undefined;
  const parseDate = (v: unknown) => {
    if (v == null || v === "") return null;
    const s = typeof v === "string" ? v : String(v);
    const d = new Date(s);
    return isNaN(+d) ? null : d;
  };

  const data: any = {};
  if ("name" in body) data.name = normStr(body.name) || "";
  if ("username" in body) data.username = optStr(body.username);
  if ("email" in body) data.email = optStr(body.email);
  if ("phone" in body) data.phone = optStr(body.phone);
  if ("birthday" in body) data.birthday = parseDate(body.birthday);
  if ("classroom" in body) data.classroom = optStr(body.classroom);
  if ("role" in body) data.role = optStr(body.role);
  if ("avatarUrl" in body) data.avatarUrl = optStr(body.avatarUrl);
  if ("telegram" in body) data.telegram = optStr(body.telegram);
  if ("about" in body) data.about = optStr(body.about);
  if ("notifyEmail" in body) {
    const b = boolish(body.notifyEmail);
    if (typeof b === "boolean") data.notifyEmail = b;
  }
  if ("notifyTelegram" in body) {
    const b = boolish(body.notifyTelegram);
    if (typeof b === "boolean") data.notifyTelegram = b;
  }
  if ("subjects" in body) {
    data.subjects = Array.isArray(body.subjects)
      ? body.subjects.map((x: any) => String(x).trim()).filter(Boolean).join(", ")
      : optStr(body.subjects);
  }
  if ("methodicalGroups" in body) {
    data.methodicalGroups = Array.isArray(body.methodicalGroups)
      ? body.methodicalGroups.map((x: any) => String(x).trim()).filter(Boolean).join(", ")
      : optStr(body.methodicalGroups);
  }

  if (Object.keys(data).length === 0) return ok({ ok: true, userId: id, unchanged: true });

  try {
    const updated = await prisma.user.update({ where: { id }, data });
    return ok({
      ok: true,
      user: {
        id: updated.id,
        name: updated.name,
        username: updated.username,
        email: updated.email,
        phone: updated.phone,
        birthday: updated.birthday?.toISOString() ?? null,
        classroom: updated.classroom ?? null,
        role: updated.role ?? null,
        avatarUrl: updated.avatarUrl ?? null,
        telegram: updated.telegram ?? null,
        about: updated.about ?? null,
        notifyEmail: updated.notifyEmail,
        notifyTelegram: updated.notifyTelegram,
        subjects: updated.subjects ?? null,
        methodicalGroups: updated.methodicalGroups ?? null,
        lastSeen: updated.lastSeen?.toISOString() ?? null,
      },
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      const target = Array.isArray(e.meta?.target) ? e.meta.target.join(",") : e.meta?.target ?? "unique_field";
      return bad(`Unique constraint failed on: ${target}`, 409);
    }
    if (e?.code === "P2025") {
      return bad("User not found", 404);
    }
    console.error("users PATCH error:", e);
    return bad("Internal error", 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

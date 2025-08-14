import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { parseStrArray, toDbStrArray } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (d: unknown, i: ResponseInit = {}) =>
  new Response(JSON.stringify(d), {
    status: i.status ?? 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function toDateOrNull(v: unknown): Date | null {
  if (!v) return null;
  const s = String(v);
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  return isNaN(d.getTime()) ? null : d;
}
function normEmail(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return /\S+@\S+\.\S+/.test(s) ? s : s;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions as any).catch(() => null);
    const uid = (session as any)?.user?.id as string | undefined;
    if (!uid) return json({ error: "Не авторизован" }, { status: 401 });

    const u = (await (prisma as any).user.findUnique({ where: { id: uid } })) as any;
    if (!u) return json({ error: "Пользователь не найден" }, { status: 404 });

    return json({
      id: u.id,
      name: u.name ?? null,
      username: u.username ?? null, // только показываем
      email: u.email ?? null,
      phone: u.phone ?? null,
      classroom: u.classroom ?? null,
      role: u.role ?? null,
      birthday: u.birthday ? new Date(u.birthday).toISOString() : null,
      telegram: u.telegram ?? null,
      avatarUrl: u.avatarUrl ?? null,
      about: u.about ?? null,
      notifyEmail: !!u.notifyEmail,
      notifyTelegram: !!u.notifyTelegram,
      subjects: parseStrArray(u.subjects),
      methodicalGroups: parseStrArray(u.methodicalGroups),
    });
  } catch (e: any) {
    return json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions as any).catch(() => null);
    const uid = (session as any)?.user?.id as string | undefined;
    if (!uid) return json({ error: "Не авторизован" }, { status: 401 });

    const b = await req.json().catch(() => ({} as any));
    const data: any = {};
    if (typeof b?.name === "string") data.name = b.name.trim();
    if (b?.email !== undefined) data.email = normEmail(b.email);
    if (typeof b?.phone === "string" || b?.phone === null) data.phone = b.phone || null;
    if (b?.birthday !== undefined) data.birthday = toDateOrNull(b.birthday);
    if (b?.subjects !== undefined) data.subjects = toDbStrArray(b.subjects);
    if (b?.methodicalGroups !== undefined) data.methodicalGroups = toDbStrArray(b.methodicalGroups);
    if (typeof b?.about === "string" || b?.about === null) data.about = b.about ?? null;
    if (typeof b?.telegram === "string" || b?.telegram === null) data.telegram = b.telegram ?? null;
    if (typeof b?.avatarUrl === "string" || b?.avatarUrl === null) data.avatarUrl = b.avatarUrl ?? null;
    if (typeof b?.notifyEmail === "boolean") data.notifyEmail = b.notifyEmail;
    if (typeof b?.notifyTelegram === "boolean") data.notifyTelegram = b.notifyTelegram;
    // username здесь не меняем

    const u = (await (prisma as any).user.update({ where: { id: uid }, data })) as any;

    return json({
      id: u.id,
      name: u.name ?? null,
      username: u.username ?? null,
      email: u.email ?? null,
      phone: u.phone ?? null,
      classroom: u.classroom ?? null,
      role: u.role ?? null,
      birthday: u.birthday ? new Date(u.birthday).toISOString() : null,
      telegram: u.telegram ?? null,
      avatarUrl: u.avatarUrl ?? null,
      about: u.about ?? null,
      notifyEmail: !!u.notifyEmail,
      notifyTelegram: !!u.notifyTelegram,
      subjects: parseStrArray(u.subjects),
      methodicalGroups: parseStrArray(u.methodicalGroups),
    });
  } catch (e: any) {
    return json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

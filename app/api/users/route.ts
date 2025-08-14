import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { hash } from "bcryptjs";
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
function canManage(s: any) {
  const r = s?.user?.role as string | undefined;
  return r === "director" || r === "deputy_plus";
}
function normEmail(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return /\S+@\S+\.\S+/.test(s) ? s : s;
}

export async function GET() {
  const rows = (await (prisma as any).user.findMany({
    orderBy: { name: "asc" },
  })) as any[];
  return json(
    rows.map((u) => ({
      id: u.id,
      name: u.name ?? null,
      username: u.username ?? null,
      email: u.email ?? null,
      phone: u.phone ?? null,
      classroom: u.classroom ?? null,
      role: u.role ?? "teacher",
      roleSlug: u.role ?? "teacher",
      birthday: u.birthday ? new Date(u.birthday).toISOString() : null,
      subjects: parseStrArray(u.subjects),
      methodicalGroups: parseStrArray(u.methodicalGroups),
      about: u.about ?? null,
      telegram: u.telegram ?? null,
      avatarUrl: u.avatarUrl ?? null,
      notifyEmail: !!u.notifyEmail,
      notifyTelegram: !!u.notifyTelegram,
    }))
  );
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!canManage(session))
    return json({ error: "Недостаточно прав" }, { status: 403 });

  const b = await req.json().catch(() => ({} as any));
  const password = String(b?.password ?? "").trim();

  const data: any = {
    name: String(b?.name ?? "").trim(),
    username: typeof b?.username === "string" ? b.username.trim() || null : null,
    role: typeof b?.roleSlug === "string" ? b.roleSlug : b?.role ?? "teacher",
    email: normEmail(b?.email),
    phone: b?.phone || null,
    classroom: b?.classroom || null,
    birthday: toDateOrNull(b?.birthday),
    subjects: toDbStrArray(b?.subjects),
    methodicalGroups: toDbStrArray(b?.methodicalGroups),
    about: typeof b?.about === "string" ? b.about : null,
    telegram: typeof b?.telegram === "string" ? b.telegram : null,
    avatarUrl: typeof b?.avatarUrl === "string" ? b.avatarUrl : null,
    notifyEmail: Boolean(b?.notifyEmail),
    notifyTelegram: Boolean(b?.notifyTelegram),
    passwordHash: password ? await hash(password, 10) : null,
  };
  if (!data.name) return json({ error: "Имя обязательно" }, { status: 400 });
  if (!data.username) return json({ error: "Логин обязателен" }, { status: 400 });

  const created = (await (prisma as any).user.create({ data })) as any;

  return json({
    ...created,
    birthday: created.birthday
      ? new Date(created.birthday).toISOString()
      : null,
    subjects: parseStrArray(created.subjects),
    methodicalGroups: parseStrArray(created.methodicalGroups),
  });
}

export async function PUT(req: Request) {
  return POST(req);
}

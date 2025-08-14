// app/api/profile/password/route.ts
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { compare, hash } from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const uid = (session?.user as any)?.id as string | undefined;
    if (!uid) return json({ error: "Не авторизован" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const currentPassword: string | undefined = body?.currentPassword;
    const newPassword: string | undefined = body?.newPassword;

    if (!currentPassword || !newPassword) {
      return json({ error: "Требуются текущий и новый пароль" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: uid },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash) {
      return json({ error: "У пользователя не задан пароль" }, { status: 400 });
    }

    const ok = await compare(currentPassword, user.passwordHash);
    if (!ok) return json({ error: "Неверный текущий пароль" }, { status: 400 });

    const newHash = await hash(newPassword, 10);
    await prisma.user.update({
      where: { id: uid },
      data: { passwordHash: newHash },
    });

    return json({ ok: true });
  } catch (e: any) {
    console.error("[/api/profile/password] error:", e);
    return json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}

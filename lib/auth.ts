// lib/auth.ts
import NextAuth, { NextAuthOptions, getServerSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import * as RBAC from "@/lib/rbac";

function isRootUserSafe(user: any): boolean {
  try {
    if (typeof (RBAC as any)?.isRootUser === "function") {
      return !!(RBAC as any).isRootUser(user);
    }
  } catch {}
  return user?.name === "Евжик Иван Сергеевич";
}

export const authOptions: NextAuthOptions = {
  debug: process.env.NODE_ENV === "development",
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  providers: [
    Credentials({
      credentials: {
        username: { label: "username/email/ФИО", type: "text" },
        password: { label: "password", type: "password" },
      },
      authorize: async (creds) => {
        try {
          const username = String(creds?.username || "").trim();
          const password = String(creds?.password || "");
          if (!username || !password) return null;

          const user =
            (await prisma.user.findFirst({ where: { username } })) ||
            (await prisma.user.findFirst({ where: { email: username } })) ||
            (await prisma.user.findFirst({ where: { name: username } }));

          if (!user || !user.passwordHash) return null;

          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) return null;

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            username: user.username,
            role: user.role,
          } as any;
        } catch (e) {
          console.error("[auth][authorize] error:", e);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        (token as any).uid = (user as any).id;
        token.name = user.name || token.name;
        (token as any).role = (user as any).role || null;
        (token as any).username = (user as any).username || null;
        (token as any).isRoot = isRootUserSafe(user);
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as any) = {
        id: (token as any).uid || token.sub,
        name: session.user?.name || (token as any).name || "",
        email: session.user?.email || null,
        username: (token as any).username || null,
        role: (token as any).role || null,
        isRoot: !!(token as any).isRoot,
      };
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// для совместимости с существующим кодом (`auth()` в API-роутах)
export const auth = () => getServerSession(authOptions);

// next-auth handler для маршрута
const handler = NextAuth(authOptions);
export { handler };

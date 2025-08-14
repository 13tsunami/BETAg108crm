// auth.config.ts
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  debug: true,
  providers: [
    CredentialsProvider({
      name: "Логин и пароль",
      credentials: {
        username: { label: "Логин", type: "text" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        const idf = credentials?.username?.toString().trim() ?? "";
        const pwd = credentials?.password?.toString() ?? "";
        if (!idf || !pwd) return null;

        const cols = await prisma.$queryRawUnsafe<{ name: string }[]>(
          `PRAGMA table_info('User');`
        );
        const hasUsername = cols.some((c) => c.name === "username");

        let u: any = null;
        if (hasUsername) {
          const rows = await prisma.$queryRawUnsafe<any[]>(
            `SELECT id, name, email, username, role, passwordHash
             FROM "User" WHERE "username" = ? LIMIT 1`,
            idf
          );
          u = rows[0] ?? null;
        } else {
          if (idf.includes("@")) u = await prisma.user.findUnique({ where: { email: idf } });
          if (!u) {
            const digits = idf.replace(/\D+/g, "");
            if (digits.length >= 5) u = await prisma.user.findUnique({ where: { phone: idf } });
          }
          if (!u) u = await prisma.user.findFirst({ where: { name: idf } });
        }

        if (!u?.passwordHash) return null;
        if (!(await compare(pwd, u.passwordHash))) return null;

        return { id: u.id, name: u.name ?? idf, email: u.email ?? null, role: u.role ?? "user" } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role ?? "user";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role ?? "user";
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "dev_secret_change_me",
};

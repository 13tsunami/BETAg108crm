// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "@/auth.config";

export const runtime = "nodejs";        // ⬅︎ ОБЯЗАТЕЛЬНО для Prisma
export const dynamic = "force-dynamic"; // ⬅︎ чтобы не кешировался ответ /session

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };

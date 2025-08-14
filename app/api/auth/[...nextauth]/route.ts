// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "@/auth.config";

export const runtime = "nodejs";        // в¬…пёЋ РћР‘РЇР—РђРўР•Р›Р¬РќРћ РґР»СЏ Prisma
export const dynamic = "force-dynamic"; // в¬…пёЋ С‡С‚РѕР±С‹ РЅРµ РєРµС€РёСЂРѕРІР°Р»СЃСЏ РѕС‚РІРµС‚ /session

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };


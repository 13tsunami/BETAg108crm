import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

function getUserId(req: NextRequest) {
  const h = req.headers.get("x-user-id"); if (h) return h;
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)uid=([^;]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function GET(req: NextRequest) {
  const uid = getUserId(req);
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json([]);

  const needle = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
  const rows = await prisma.$queryRawUnsafe<
    { id: string; name: string | null; email: string | null }[]
  >(
    `SELECT id, name, email FROM "User"
     WHERE (LOWER(COALESCE(name,'')) LIKE LOWER(?) ESCAPE '\\'
         OR LOWER(COALESCE(email,'')) LIKE LOWER(?) ESCAPE '\\')
       AND (? IS NULL OR id <> ?)
     ORDER BY LOWER(COALESCE(name, '')) ASC
     LIMIT 20;`,
    needle, needle, uid, uid
  );

  return NextResponse.json(rows);
}

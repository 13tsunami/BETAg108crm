import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const preferredRegion = ["fra1","cdg1","arn1"];

function mask(url?: string|null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const user = u.username ? `${u.username}:***@` : "";
    return `${u.protocol}//${user}${u.host}${u.pathname}${u.search}`;
  } catch { return "<bad url>"; }
}

export async function GET() {
  const preferDirect = process.env.FORCE_DIRECT_URL === "1";
  const selected = preferDirect
    ? (process.env.DIRECT_URL ?? process.env.DATABASE_URL)
    : (process.env.DATABASE_URL ?? process.env.DIRECT_URL);
  return NextResponse.json({
    ok: true,
    preferDirect,
    regionHint: ["fra1","cdg1","arn1"],
    env: {
      DATABASE_URL: mask(process.env.DATABASE_URL),
      DIRECT_URL: mask(process.env.DIRECT_URL),
      FORCE_DIRECT_URL: process.env.FORCE_DIRECT_URL ?? null,
    },
    selected: mask(selected),
  });
}

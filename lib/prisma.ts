// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const preferDirect = process.env.FORCE_DIRECT_URL === "1";
const datasourceUrl = preferDirect
  ? (process.env.DIRECT_URL ?? process.env.DATABASE_URL)
  : (process.env.DATABASE_URL ?? process.env.DIRECT_URL);

try {
  const u = new URL(datasourceUrl ?? "");
  const masked = `${u.protocol}//${u.username ? u.username + ":***@" : ""}${u.host}${u.pathname}${u.search}`;
  console.log("[prisma] datasource =", masked);
} catch {}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: datasourceUrl } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

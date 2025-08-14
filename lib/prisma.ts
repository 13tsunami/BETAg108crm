// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Позволим временно форсировать прямое подключение (минует pooler) через env:
const preferDirect = process.env.FORCE_DIRECT_URL === "1";
const datasourceUrl = preferDirect
  ? (process.env.DIRECT_URL ?? process.env.DATABASE_URL)
  : (process.env.DATABASE_URL ?? process.env.DIRECT_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: datasourceUrl } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

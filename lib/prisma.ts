// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// В рантайме используем pooled URL, а если его нет — DIRECT_URL.
// (Если позже захочешь всегда ходить через пула — просто убери DIRECT_URL из fallBack.)
const datasourceUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: datasourceUrl } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// в dev горячая перезагрузка не плодит клиентов
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

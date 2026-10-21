import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"

import { PrismaClient } from "@/lib/generated/prisma/client"
import * as PrismaNamespace from "@/lib/generated/prisma/internal/prismaNamespace"

type Cache = { prisma?: PrismaClient; schema?: string }
const globalForPrisma = globalThis as unknown as Cache

/** Every model's column list, so a client built before `prisma generate` can be told apart from a current one. */
const SCHEMA = JSON.stringify(Object.entries(PrismaNamespace).filter(([name]) => name.endsWith("ScalarFieldEnum")))

function createClient() {
  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" })
  return new PrismaClient({ adapter })
}

// In development the client is cached across hot reloads. If the schema changed since it was created, a stale client
// rejects new columns ("Unknown argument"), so build a fresh one instead of reusing it.
if (globalForPrisma.prisma && globalForPrisma.schema !== SCHEMA) {
  void globalForPrisma.prisma.$disconnect().catch(() => {})
  globalForPrisma.prisma = undefined
}

export const db = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db
  globalForPrisma.schema = SCHEMA
}

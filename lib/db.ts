import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "@/lib/generated/prisma/client"
import * as PrismaNamespace from "@/lib/generated/prisma/internal/prismaNamespace"

type Cache = { prisma?: PrismaClient; schema?: string }
const globalForPrisma = globalThis as unknown as Cache

/** Every model's column list, so a client built before `prisma generate` can be told apart from a current one. */
const SCHEMA = JSON.stringify(Object.entries(PrismaNamespace).filter(([name]) => name.endsWith("ScalarFieldEnum")))

function createClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is not set. Point it at a Postgres database (see .env.example).")
  if (!/^postgres(ql)?:\/\//.test(connectionString)) {
    throw new Error('DATABASE_URL must be a Postgres URL (postgres://...). It looks like the old SQLite value ("file:./dev.db"): see .env.example.')
  }
  // Serverless: every running instance holds its own pool, so keep it small and use the provider's pooled connection string.
  const max = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10) || (process.env.NODE_ENV === "production" ? 5 : 10)
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max }) })
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

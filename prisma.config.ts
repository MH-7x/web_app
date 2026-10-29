import { defineConfig } from "prisma/config"

// Prisma 7 no longer loads .env on its own.
try {
  process.loadEnvFile(".env")
} catch {
  // .env is optional: on Vercel the variables are already in the environment
}

// Migrations need a direct (unpooled) connection: poolers such as PgBouncer break schema changes. The app itself
// uses DATABASE_URL, which should be the pooled one. Locally they are usually the same database.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `prisma generate` runs in the Vercel install step before any database is reachable, so a missing URL must not
  // stop it; only commands that actually connect (migrate, db push) need one.
  datasource: { url: url ?? "postgresql://unset:unset@localhost:5432/unset" },
})

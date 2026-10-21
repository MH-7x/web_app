import { defineConfig } from "prisma/config"

// Prisma 7 no longer loads .env on its own.
try {
  process.loadEnvFile(".env")
} catch {
  // .env is optional; fall back to the default below
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
})

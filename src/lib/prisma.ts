import { PrismaClient } from "@prisma/client";

/**
 * Нормализует Neon connection URL под Prisma:
 *  - добавляет connect_timeout=30 (на cold-start Neon compute)
 *  - добавляет pgbouncer=true если hostname содержит -pooler
 *  - убирает channel_binding=require (избыточно для Prisma, иногда мешает SCRAM)
 *
 * DATABASE_URL приходит из Neon ↔ Vercel интеграции в виде
 *   postgres://...-pooler.../db?channel_binding=require&sslmode=require
 * и не поддаётся правке через Vercel UI — интеграция перезаписывает.
 * Поэтому нормализуем здесь.
 */
function normalizeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    const params = u.searchParams;
    params.delete("channel_binding");
    if (!params.has("sslmode")) params.set("sslmode", "require");
    if (!params.has("connect_timeout")) params.set("connect_timeout", "30");
    if (u.hostname.includes("-pooler") && !params.has("pgbouncer")) {
      params.set("pgbouncer", "true");
    }
    u.search = params.toString();
    return u.toString();
  } catch {
    return raw;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const datasourceUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

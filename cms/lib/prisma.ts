import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@localhost:5432/mydb?schema=public";

// Configure PG Pool with short connection timeout and background error handler
const pool = new pg.Pool({
  connectionString,
  connectionTimeoutMillis: 1500,
  idleTimeoutMillis: 5000,
  max: 5,
});

pool.on("error", (err) => {
  // Catch background pool connection error if PostgreSQL server is offline
  console.warn("[PostgreSQL Pool] Connection error (Server offline):", err.message);
});

const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Execute Prisma query safely with connection timeout & mock fallback when DB is offline.
 */
export async function safePrismaQuery(
  queryFn: () => Promise<any>,
  fallback: any
): Promise<{ data: any; source: "database" | "mock" }> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Database connection timeout")), 1200)
    );
    const result = await Promise.race([queryFn(), timeoutPromise]);
    if (result === null || result === undefined) {
      return { data: fallback, source: "mock" };
    }
    return { data: result, source: "database" };
  } catch (error: any) {
    console.warn("[Prisma DB Fallback]", error?.message || "DB Offline");
    return { data: fallback, source: "mock" };
  }
}

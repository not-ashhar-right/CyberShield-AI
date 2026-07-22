import { PrismaClient } from "@prisma/client";
import dns from "dns/promises";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

let prismaInstance: PrismaClient | undefined = globalForPrisma.prisma;

export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop, receiver) {
    if (!prismaInstance) {
      prismaInstance = new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      });
      if (process.env.NODE_ENV !== "production") {
        globalForPrisma.prisma = prismaInstance;
      }
    }
    return Reflect.get(prismaInstance, prop, receiver);
  }
});

async function resolveUrlToIPv4(urlStr: string | undefined): Promise<string | undefined> {
  if (!urlStr) return urlStr;
  try {
    const match = urlStr.match(/^(postgresql:\/\/.*?@)(.*?)(:\d+.*)$/);
    if (!match) return urlStr;
    const [_, prefix, host, suffix] = match;
    
    // Check if host is already an IP address
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
      return urlStr;
    }
    
    const result = await dns.lookup(host, { family: 4 });
    return `${prefix}${result.address}${suffix}`;
  } catch (err: any) {
    console.warn(`⚠️ Warning: Failed to resolve database host "${urlStr}" to IPv4:`, err.message);
    return urlStr;
  }
}

export async function connectDatabase(): Promise<void> {
  try {
    // Resolve hostnames to IPv4 before Prisma connects
    if (process.env.DATABASE_URL) {
      const resolved = await resolveUrlToIPv4(process.env.DATABASE_URL);
      if (resolved) {
        process.env.DATABASE_URL = resolved;
      }
    }
    if (process.env.DIRECT_URL) {
      const resolved = await resolveUrlToIPv4(process.env.DIRECT_URL);
      if (resolved) {
        process.env.DIRECT_URL = resolved;
      }
    }

    // Do NOT call prisma.$connect() explicitly — Prisma connects lazily.
    // Calling $connect() before a query on a PgBouncer (transaction-mode) connection
    // can cause "prepared statement already exists" errors on hot reload because the
    // pooler reuses server connections across process restarts.
    //
    // Instead, issue a single lightweight query to verify the connection is reachable.
    await prisma.$queryRaw`SELECT 1`;
    console.log("✅ Database connected (Supabase PostgreSQL)");
  } catch (error: any) {
    console.error("❌ Database connection failed:");
    if (error.message?.includes("ENOTFOUND") || error.message?.includes("ECONNREFUSED")) {
      console.error("   Could not reach the database server.");
      console.error("   Verify DATABASE_URL in your .env file.");
    } else if (error.message?.includes("authentication")) {
      console.error("   Authentication failed. Check your credentials.");
    } else {
      console.error("  ", error.message || error);
    }
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
  }
}


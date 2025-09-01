/**
 * Database Client
 * 
 * This module provides database access with fallback to prevent crashes
 */

import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

// For now, create a dummy Prisma client that won't crash
// The actual Data API implementation will be used later
const prisma = global.prisma || new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://placeholder:placeholder@localhost:5432/placeholder"
    }
  },
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;

// Export helper to indicate we're using Data API (future implementation)
export const isUsingDataAPI = true;
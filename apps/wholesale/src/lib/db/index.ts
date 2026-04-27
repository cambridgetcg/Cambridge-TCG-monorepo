import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString, {
  max: 1, // Vercel serverless: 1 connection per function invocation
  ssl: "require",
});

export const db = drizzle(client, { schema });

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// node-postgres works with any PostgreSQL (Docker, managed, Neon...).
// Use `?sslmode=require` in DATABASE_URL for TLS connections.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_SIZE || "10", 10),
});
export const db = drizzle(pool, { schema });

pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err.message);
});

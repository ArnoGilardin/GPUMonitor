import path from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { PoolClient } from "pg";
import { db, pool } from "./db";

const MIGRATIONS_FOLDER = process.env.MIGRATIONS_DIR || path.resolve(process.cwd(), "migrations");

// Arbitrary constant: serialises migrations when several instances start together
const LOCK_ID = 727_001;

async function exists(client: PoolClient, query: string, params: unknown[] = []) {
  const { rows } = await client.query(query, params);
  return rows.length > 0;
}

/**
 * Databases created before versioned migrations (with `drizzle-kit push`)
 * already contain the tables. Record the migrations that their schema
 * already matches, so only the newer ones run.
 */
async function baselineLegacyDatabase(client: PoolClient): Promise<number | null> {
  const hasJournal = await exists(
    client,
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'",
  );
  if (hasJournal && (await exists(client, "SELECT 1 FROM drizzle.__drizzle_migrations LIMIT 1"))) return null;

  const column = (table: string, col: string) =>
    exists(client, "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2", [table, col]);

  if (!(await exists(client, "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'servers'"))) {
    return null; // empty database: run everything
  }

  // Index of the last migration the existing schema already contains
  let applied = 0; // 0000_init: v1 schema
  if (await column("servers", "api_key_hash")) applied = 1; // 0001_fleet_v2
  if (await column("servers", "processes")) applied = 2; // 0002_phase2

  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await client.query(
    "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)",
  );
  for (const m of migrations.slice(0, applied + 1)) {
    await client.query("INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)", [m.hash, m.folderMillis]);
  }
  return applied;
}

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    const baselined = await baselineLegacyDatabase(client);
    if (baselined !== null) {
      console.log(`ℹ️  Existing database adopted: migrations up to #${baselined} marked as applied`);
    }
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("✅ Database schema up to date");
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    client.release();
  }
}

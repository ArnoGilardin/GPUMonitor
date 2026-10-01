#!/usr/bin/env tsx
// Apply pending migrations: npm run db:migrate
import { runMigrations } from "../server/migrate";
import { pool } from "../server/db";

runMigrations()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });

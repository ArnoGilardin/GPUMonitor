import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` works offline; push/migrate/studio need DATABASE_URL.
export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://localhost/unused",
  },
});

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // server modules build a (lazy) pg pool at import time
    env: { DATABASE_URL: "postgresql://unused@localhost/unused" },
  },
});

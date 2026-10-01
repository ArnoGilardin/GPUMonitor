import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { bootstrap, startBackgroundJobs, stopBackgroundJobs } from "./jobs";
import { pool } from "./db";
import { runMigrations } from "./migrate";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    if (path.startsWith("/api") || path.startsWith("/v1")) {
      // Bodies are not logged: they can carry tokens and API keys
      log(`${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`);
    }
  });
  next();
});

(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Database connection successful");
  } catch (err: any) {
    console.error("❌ Database connection failed:", err.message);
    console.error("Please check your DATABASE_URL environment variable");
    process.exit(1);
  }

  try {
    if (process.env.DB_AUTO_MIGRATE !== "false") await runMigrations();
    await bootstrap();
  } catch (err: any) {
    console.error("❌ Database setup failed:", err.message);
    process.exit(1);
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    console.error("Express error handler:", err);
    if (res.headersSent) return;
    res.status(status).json({ message: status >= 500 ? "Internal server error" : err.message });
  });

  // Vite is set up last so its catch-all route doesn't shadow the API
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "5100", 10);
  server.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
  });

  startBackgroundJobs();

  const shutdown = (signal: string) => {
    log(`${signal} received, shutting down`);
    stopBackgroundJobs();
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
})();

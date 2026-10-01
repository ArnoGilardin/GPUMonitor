const isProduction = process.env.NODE_ENV === "production";

function secret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) {
    throw new Error(`${name} must be set in production`);
  }
  return devFallback;
}

export const config = {
  isProduction,
  jwtSecret: secret("JWT_SECRET", "development-secret-key"),
  refreshTokenSecret: secret("REFRESH_TOKEN_SECRET", "development-refresh-secret"),
  // Global collector key. Optional in production when every server uses its own key.
  collectorApiKey: process.env.COLLECTOR_API_KEY || (isProduction ? "" : "collector-key-123"),
  // When true, only per-server keys are accepted by /v1/ingest
  requireServerKeys: process.env.REQUIRE_SERVER_KEYS === "true",
  allowRegistration: process.env.ALLOW_REGISTRATION === "true",
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || "12", 10),
  publicUrl: process.env.PUBLIC_URL || process.env.FRONTEND_URL || "",
};

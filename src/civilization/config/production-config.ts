/**
 * Production Configuration Contract & Startup Validator.
 *
 * Centralized, validated environment configuration for the Technocore Autonomous Network.
 * Enforces strict runtime invariants:
 * - In production mode (NODE_ENV === "production"), DATABASE_URL must be a valid PostgreSQL connection string.
 * - Secret credentials (LLM API keys, database passwords) are never exposed to browser bundles or logs.
 * - Enforces safe defaults for rate limiting, CORS origins, and clock skew limits.
 */

export interface ProductionConfig {
  readonly nodeEnv: "development" | "production" | "test";
  readonly isProduction: boolean;
  /** Primary persistence database connection string (PostgreSQL in production, SQLite in dev/test) */
  readonly databaseUrl?: string;
  /** Local SQLite database path (used only if databaseUrl is not set) */
  readonly sqliteDbPath: string;
  /** Maximum allowable clock skew in seconds (default: 300s) */
  readonly maxClockSkewSeconds: number;
  /** Maximum allowable event payload size in bytes (default: 256 KB) */
  readonly maxPayloadSizeBytes: number;
  /** Token-bucket rate limiter burst capacity per DID (default: 60) */
  readonly rateLimitCapacity: number;
  /** Token-bucket refill rate in tokens per second per DID (default: 5) */
  readonly rateLimitRefillPerSecond: number;
  /** Allowed CORS origins for gateway and SSE endpoints (comma-separated or '*' in dev) */
  readonly corsAllowedOrigins: readonly string[];
  /** Optional LLM provider API keys (kept strictly server-side) */
  readonly llmApiKey?: string;
  readonly anthropicApiKey?: string;
  readonly openaiApiKey?: string;
  /** Log level for operational telemetry */
  readonly logLevel: "debug" | "info" | "warn" | "error";
  /** Execution sandbox policy ('TRUSTED_BENCHMARK_ONLY' or 'DISABLED') */
  readonly sandboxPolicy: "TRUSTED_BENCHMARK_ONLY" | "DISABLED";
}

export interface ValidationIssue {
  readonly field: string;
  readonly severity: "ERROR" | "WARNING";
  readonly message: string;
}

export interface ConfigValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly config: ProductionConfig;
}

function parseCorsOrigins(raw?: string): readonly string[] {
  if (!raw || raw.trim() === "" || raw === "*") {
    return Object.freeze(["*"]);
  }
  return Object.freeze(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export function loadProductionConfig(env: Record<string, string | undefined> = process.env): ProductionConfig {
  const nodeEnv = (env.NODE_ENV === "production" ? "production" : env.NODE_ENV === "test" ? "test" : "development") as ProductionConfig["nodeEnv"];
  const isProduction = nodeEnv === "production";

  return Object.freeze({
    nodeEnv,
    isProduction,
    databaseUrl: env.DATABASE_URL?.trim() || undefined,
    sqliteDbPath: env.CIVILIZATION_DB_PATH?.trim() || ".technocore/civilization.db",
    maxClockSkewSeconds: Number(env.CIVILIZATION_MAX_CLOCK_SKEW_SECONDS ?? "300") || 300,
    maxPayloadSizeBytes: Number(env.CIVILIZATION_MAX_PAYLOAD_BYTES ?? "262144") || 262144,
    rateLimitCapacity: Number(env.CIVILIZATION_RATE_LIMIT_CAPACITY ?? "60") || 60,
    rateLimitRefillPerSecond: Number(env.CIVILIZATION_RATE_LIMIT_REFILL_PER_SEC ?? "5") || 5,
    corsAllowedOrigins: parseCorsOrigins(env.CIVILIZATION_CORS_ORIGINS),
    llmApiKey: env.LLM_API_KEY?.trim() || undefined,
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    openaiApiKey: env.OPENAI_API_KEY?.trim() || undefined,
    logLevel: (env.LOG_LEVEL ?? "info") as ProductionConfig["logLevel"],
    sandboxPolicy: (env.CIVILIZATION_SANDBOX_POLICY === "DISABLED" ? "DISABLED" : "TRUSTED_BENCHMARK_ONLY"),
  });
}

/**
 * Validates the loaded configuration against production requirements.
 */
export function validateProductionConfig(config: ProductionConfig = loadProductionConfig()): ConfigValidationResult {
  const issues: ValidationIssue[] = [];

  if (config.isProduction) {
    if (!config.databaseUrl) {
      issues.push({
        field: "DATABASE_URL",
        severity: "ERROR",
        message: "DATABASE_URL is required in production. SQLite is not permitted as a production database.",
      });
    } else if (!config.databaseUrl.startsWith("postgres://") && !config.databaseUrl.startsWith("postgresql://")) {
      issues.push({
        field: "DATABASE_URL",
        severity: "ERROR",
        message: "DATABASE_URL in production must be a valid PostgreSQL connection string starting with postgres:// or postgresql://",
      });
    }

    if (config.corsAllowedOrigins.includes("*")) {
      issues.push({
        field: "CIVILIZATION_CORS_ORIGINS",
        severity: "WARNING",
        message: "CIVILIZATION_CORS_ORIGINS is set to '*' in production. Consider restricting allowed origins to trusted domains.",
      });
    }
  }

  if (config.rateLimitCapacity < 1) {
    issues.push({
      field: "CIVILIZATION_RATE_LIMIT_CAPACITY",
      severity: "ERROR",
      message: "Rate limit capacity must be at least 1.",
    });
  }

  if (config.rateLimitRefillPerSecond <= 0) {
    issues.push({
      field: "CIVILIZATION_RATE_LIMIT_REFILL_PER_SEC",
      severity: "ERROR",
      message: "Rate limit refill rate must be greater than 0.",
    });
  }

  const hasErrors = issues.some((i) => i.severity === "ERROR");

  return Object.freeze({
    valid: !hasErrors,
    issues: Object.freeze(issues),
    config,
  });
}

/**
 * Startup assertion for production server bootstrapping.
 * Throws a descriptive error if required production configuration is missing.
 */
export function assertValidProductionStartup(env: Record<string, string | undefined> = process.env): ProductionConfig {
  const validation = validateProductionConfig(loadProductionConfig(env));
  if (!validation.valid) {
    const errorMessages = validation.issues
      .filter((i) => i.severity === "ERROR")
      .map((i) => `  - [${i.field}] ${i.message}`)
      .join("\n");
    throw new Error(`[Technocore] Production Configuration Failure:\n${errorMessages}`);
  }
  return validation.config;
}

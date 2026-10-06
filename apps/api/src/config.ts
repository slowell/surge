// Env config, validated once at startup. Errors name the variable, never its value.
import { z } from "zod";

const Config = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  JWT_SECRET: z.string().min(8),
  ADMIN_TOKEN: z.string().min(8),
  MAX_ADMITS_PER_SEC: z.coerce.number().int().positive().default(2000),
  // Only needed by the admin challenge-drafting endpoint (M2). Optional so the API boots without it.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).optional(),
});
export type Config = z.infer<typeof Config>;

export class ConfigError extends Error {
  override name = "ConfigError";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Treat empty strings as unset, so `ANTHROPIC_API_KEY=` in .env means "not configured".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ""));
  const result = Config.safeParse(cleaned);
  if (result.success) return result.data;

  const problems = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
  throw new ConfigError(
    `Invalid environment configuration:\n${problems.join("\n")}\n` +
      `Copy .env.example to .env for local development, or set these in the environment.`,
  );
}

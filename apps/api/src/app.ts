import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { healthRoutes, type HealthChecks } from "./routes/health";

export interface AppDeps {
  /** A pino logger. Typed as Fastify's base logger so the instance keeps Fastify's default generics. */
  logger: FastifyBaseLogger;
  health: HealthChecks;
}

// Dependencies are injected so tests can build the app with fakes.
export function buildApp({ logger, health }: AppDeps): FastifyInstance {
  const app = Fastify({ loggerInstance: logger });
  healthRoutes(app, health);
  return app;
}

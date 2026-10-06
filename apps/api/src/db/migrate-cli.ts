// `pnpm db:migrate`: apply pending migrations to DATABASE_URL.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { MigrationError, migrate } from "./migrate";

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env, or set it in the environment.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  const { applied, alreadyApplied } = await migrate(client, { dir: MIGRATIONS_DIR, log: (m) => console.log(m) });
  console.log(
    applied.length
      ? `Applied ${applied.length} migration(s); ${alreadyApplied.length} already applied.`
      : `Up to date (${alreadyApplied.length} applied).`,
  );
} catch (err) {
  console.error(err instanceof MigrationError ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}

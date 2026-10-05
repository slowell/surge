// Run a .sql file against DATABASE_URL. Used by `pnpm db:readonly-role` so nobody needs psql on Windows.
// Usage: tsx scripts/run-sql.ts <file.sql>
import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
const url = process.env.DATABASE_URL;
if (!file) {
  console.error("Usage: tsx scripts/run-sql.ts <file.sql>");
  process.exit(1);
}
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env, or set it in the environment.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  await client.query(readFileSync(file, "utf8"));
  console.log(`Applied ${file}`);
} catch (err) {
  console.error(`Failed to apply ${file}: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await client.end();
}

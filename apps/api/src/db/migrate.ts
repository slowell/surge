// Minimal SQL migration runner.
//
// Layout: apps/api/migrations/NNNN_name.sql are pending (still editable on a branch);
// apps/api/migrations/applied/NNNN_name.sql are promoted (`pnpm db:promote`) and immutable.
// Both are applied together in filename order. A migration's identity is its filename, so promotion
// (a rename) doesn't re-run it. The checksum makes "immutable" hold at runtime too: if an applied
// file changes, migrate refuses to run anything.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";

export interface MigrateOptions {
  /** Directory holding pending NNNN_name.sql files, with an applied/ subdirectory. */
  dir: string;
  log?: (msg: string) => void;
}

export interface MigrateResult {
  applied: string[];
  alreadyApplied: string[];
}

export class MigrationError extends Error {
  override name = "MigrationError";
}

const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;
// Arbitrary constant: serializes concurrent `migrate` runs (e.g. API boot and CI) on the same database.
const LOCK_KEY = 72_610_001;

interface MigrationFile {
  name: string;
  file: string;
  sql: string;
  checksum: string;
}

function listDir(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => MIGRATION_FILE.test(f)) : [];
}

export function readMigrations(dir: string): MigrationFile[] {
  const appliedDir = path.join(dir, "applied");
  const promoted = listDir(appliedDir);
  const pending = listDir(dir);

  const both = pending.filter((f) => promoted.includes(f));
  if (both.length > 0) {
    throw new MigrationError(`Migration in both pending and applied/: ${both.join(", ")}. Keep only one copy.`);
  }

  return [...promoted.map((f) => path.join(appliedDir, f)), ...pending.map((f) => path.join(dir, f))]
    .map((file) => {
      // Normalize line endings so a CRLF checkout on Windows has the same checksum as LF.
      const sql = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
      return { name: path.basename(file), file, sql, checksum: createHash("sha256").update(sql).digest("hex") };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const LOCK_WAIT_MS = 30_000;

async function acquireLock(client: pg.Client): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    const { rows } = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (rows[0]?.ok) return;
    if (Date.now() > deadline) {
      throw new MigrationError(`Another migrate run has held the lock for over ${LOCK_WAIT_MS / 1000}s. Giving up.`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

export async function migrate(
  client: pg.Client,
  { dir, log = () => undefined }: MigrateOptions,
): Promise<MigrateResult> {
  const files = readMigrations(dir);

  await acquireLock(client);
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM schema_migrations ORDER BY name",
    );
    const recorded = new Map(rows.map((r) => [r.name, r.checksum]));
    const byName = new Map(files.map((f) => [f.name, f]));

    // Verify everything first, so a bad history never results in a partial run.
    for (const [name, checksum] of recorded) {
      const file = byName.get(name);
      if (!file) {
        throw new MigrationError(`${name} was applied to this database but its file is missing.`);
      }
      if (file.checksum !== checksum) {
        throw new MigrationError(
          `${name} has changed since it was applied. Applied migrations are immutable: revert the edit and write a new migration.`,
        );
      }
    }

    // A new file numbered below the latest applied one (e.g. two branches both added a migration) would run
    // out of order against a schema it was never written for. Make the author renumber it.
    const latest = [...recorded.keys()].sort().at(-1);
    const outOfOrder = files.filter((f) => !recorded.has(f.name) && latest !== undefined && f.name < latest);
    if (outOfOrder.length > 0) {
      throw new MigrationError(
        `${outOfOrder.map((f) => f.name).join(", ")} sorts before already-applied ${latest}. Renumber it after ${latest}.`,
      );
    }

    const result: MigrateResult = { applied: [], alreadyApplied: [] };
    for (const m of files) {
      if (recorded.has(m.name)) {
        result.alreadyApplied.push(m.name);
        continue;
      }
      try {
        await client.query("BEGIN");
        await client.query(m.sql);
        await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [m.name, m.checksum]);
        await client.query("COMMIT");
      } catch (err) {
        // Report the migration's error, not a secondary ROLLBACK failure (e.g. a dropped connection).
        await client.query("ROLLBACK").catch(() => undefined);
        throw new MigrationError(`${m.name} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      log(`applied ${m.name}`);
      result.applied.push(m.name);
    }
    return result;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
  }
}

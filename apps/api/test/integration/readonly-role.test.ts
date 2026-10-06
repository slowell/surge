// The MCP server connects as surge_readonly (scripts/readonly-role.sql). Prove it can read and can't write,
// even if a session turns off the read-only default.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { databaseName, testDatabaseUrl, withDatabase } from "../setup/env";

const ROLE_SQL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../scripts/readonly-role.sql");

const owner = new pg.Client({ connectionString: testDatabaseUrl });
const readonly = new pg.Client({
  connectionString: withDatabase(testDatabaseUrl, databaseName(testDatabaseUrl), {
    user: "surge_readonly",
    password: "readonly",
  }),
});

beforeAll(async () => {
  await owner.connect();
  const sql = readFileSync(ROLE_SQL, "utf8");
  await owner.query(sql);
  await owner.query(sql); // idempotent
  await readonly.connect();
});
afterAll(async () => {
  await readonly.end();
  await owner.end();
});

const pgCode = (err: unknown) => (err as { code?: string }).code;

describe("surge_readonly", () => {
  it("can read every table", async () => {
    for (const table of ["members", "drops", "claims", "points_ledger", "schema_migrations"]) {
      await expect(readonly.query(`SELECT count(*) FROM ${table}`)).resolves.toBeDefined();
    }
  });

  it("starts every transaction read-only", async () => {
    const { rows } = await readonly.query<{ v: string }>("SELECT current_setting('transaction_read_only') AS v");
    expect(rows[0]?.v).toBe("on");
  });

  it("can't write even in an explicit read-write transaction", async () => {
    await readonly.query("BEGIN READ WRITE");
    try {
      const err = await readonly.query("INSERT INTO members (handle) VALUES ('t_readonly_write')").then(
        () => null,
        (e: unknown) => e,
      );
      expect(pgCode(err)).toBe("42501"); // insufficient_privilege: the grants hold on their own
    } finally {
      await readonly.query("ROLLBACK");
    }
  });

  it("can't create tables", async () => {
    await readonly.query("BEGIN READ WRITE");
    try {
      const err = await readonly.query("CREATE TABLE t_readonly_probe (id int)").then(
        () => null,
        (e: unknown) => e,
      );
      expect(pgCode(err)).toBe("42501");
    } finally {
      await readonly.query("ROLLBACK");
    }
  });
});

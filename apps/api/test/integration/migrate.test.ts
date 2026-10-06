import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MigrationError, migrate } from "../../src/db/migrate";
import { testDatabaseUrl, withDatabase } from "../setup/env";

// Each test gets its own throwaway database and migrations directory.
const admin = new pg.Client({ connectionString: withDatabase(testDatabaseUrl, "postgres") });
let dbName: string;
let client: pg.Client;
let dir: string;

beforeAll(() => admin.connect());
afterAll(() => admin.end());

beforeEach(async () => {
  dbName = `surge_migrate_${randomBytes(4).toString("hex")}`;
  await admin.query(`CREATE DATABASE ${dbName}`);
  client = new pg.Client({ connectionString: withDatabase(testDatabaseUrl, dbName) });
  await client.connect();
  dir = mkdtempSync(path.join(tmpdir(), "surge-migrations-"));
  mkdirSync(path.join(dir, "applied"));
});

afterEach(async () => {
  await client.end();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  rmSync(dir, { recursive: true, force: true });
});

const write = (rel: string, sql: string) => writeFileSync(path.join(dir, rel), sql);
const tables = async () =>
  (
    await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    )
  ).rows.map((r) => r.tablename);

describe("migrate", () => {
  it("applies applied/ and pending files together, in filename order", async () => {
    write("applied/0001_a.sql", "CREATE TABLE a (id int);");
    write("0002_b.sql", "CREATE TABLE b (a_id int);");
    write("applied/0003_c.sql", "CREATE TABLE c (id int);");

    const result = await migrate(client, { dir });

    expect(result.applied).toEqual(["0001_a.sql", "0002_b.sql", "0003_c.sql"]);
    expect(await tables()).toEqual(["a", "b", "c", "schema_migrations"]);
  });

  it("is a no-op on re-run", async () => {
    write("applied/0001_a.sql", "CREATE TABLE a (id int);");
    await migrate(client, { dir });

    const again = await migrate(client, { dir });

    expect(again).toEqual({ applied: [], alreadyApplied: ["0001_a.sql"] });
  });

  it("keeps a migration's identity when it is promoted from pending to applied/", async () => {
    write("0001_a.sql", "CREATE TABLE a (id int);\n");
    await migrate(client, { dir });
    rmSync(path.join(dir, "0001_a.sql"));
    write("applied/0001_a.sql", "CREATE TABLE a (id int);\n");

    expect((await migrate(client, { dir })).applied).toEqual([]);
  });

  it("treats CRLF and LF checkouts of the same file as identical", async () => {
    write("applied/0001_a.sql", "CREATE TABLE a (id int);\nCREATE TABLE b (id int);\n");
    await migrate(client, { dir });
    write("applied/0001_a.sql", "CREATE TABLE a (id int);\r\nCREATE TABLE b (id int);\r\n");

    await expect(migrate(client, { dir })).resolves.toMatchObject({ applied: [] });
  });

  it("refuses to run when an applied migration was edited", async () => {
    write("applied/0001_a.sql", "CREATE TABLE a (id int);");
    await migrate(client, { dir });
    write("applied/0001_a.sql", "CREATE TABLE a (id int, sneaky text);");
    write("0002_b.sql", "CREATE TABLE b (id int);");

    await expect(migrate(client, { dir })).rejects.toThrow(MigrationError);
    await expect(migrate(client, { dir })).rejects.toThrow(/0001_a\.sql.*changed/);
    expect(await tables()).not.toContain("b"); // nothing after the mismatch ran
  });

  it("refuses to run when a recorded migration file is missing", async () => {
    write("applied/0001_a.sql", "CREATE TABLE a (id int);");
    await migrate(client, { dir });
    rmSync(path.join(dir, "applied/0001_a.sql"));

    await expect(migrate(client, { dir })).rejects.toThrow(/0001_a\.sql.*missing/);
  });

  it("refuses the same filename in both pending and applied/", async () => {
    write("applied/0001_a.sql", "CREATE TABLE a (id int);");
    write("0001_a.sql", "CREATE TABLE a (id int);");

    await expect(migrate(client, { dir })).rejects.toThrow(/both/);
  });

  it("rolls back a failing migration and records nothing for it", async () => {
    write("applied/0001_a.sql", "CREATE TABLE a (id int);");
    write("0002_bad.sql", "CREATE TABLE b (id int); SELECT * FROM does_not_exist;");

    await expect(migrate(client, { dir })).rejects.toThrow(/0002_bad\.sql/);
    expect(await tables()).toEqual(["a", "schema_migrations"]);
    const recorded = await client.query("SELECT name FROM schema_migrations");
    expect(recorded.rows).toEqual([{ name: "0001_a.sql" }]);
  });

  it("refuses a new migration numbered before an applied one", async () => {
    write("applied/0002_b.sql", "CREATE TABLE b (id int);");
    await migrate(client, { dir });
    write("0001_late.sql", "CREATE TABLE late (id int);");

    await expect(migrate(client, { dir })).rejects.toThrow(/0001_late\.sql sorts before already-applied 0002_b\.sql/);
    expect(await tables()).not.toContain("late");
  });

  it("ignores files that don't look like migrations", async () => {
    write("applied/0001_a.sql", "CREATE TABLE a (id int);");
    write("README.md", "notes");
    write("draft.sql", "this is not sql");

    expect((await migrate(client, { dir })).applied).toEqual(["0001_a.sql"]);
  });
});

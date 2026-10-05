// Postgres constraints are the backstop against duplicate claims and double-awarded points (SPEC §4, §5).
// These tests prove the schema rejects what the worker must never write twice.
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseUrl } from "../setup/env";

const db = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
beforeAll(async () => {
  await db.query("SELECT 1");
});
afterAll(() => db.end());

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const FK_VIOLATION = "23503";

const pgCode = (err: unknown) => (err as { code?: string }).code;

async function expectPgError(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, `expected Postgres error ${code}`).not.toBeNull();
  expect(pgCode(err)).toBe(code);
}

async function member(): Promise<string> {
  const handle = `t_${randomBytes(6).toString("hex")}`;
  const { rows } = await db.query<{ id: string }>("INSERT INTO members (handle) VALUES ($1) RETURNING id", [handle]);
  return rows[0]?.id ?? "";
}

async function drop(totalQty = 10, startsIn = "0 seconds"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO drops (title, sponsor, reward_name, reward_image_url, total_qty, starts_at, ends_at, challenge)
     VALUES ('Test drop', 'Test Sponsor', 'Test reward', 'https://example.com/r.png', $1,
             now() + $2::interval, now() + $2::interval + interval '1 hour',
             '{"question":"Q?","options":["a","b","c","d"],"answer_index":0}')
     RETURNING id`,
    [totalQty, startsIn],
  );
  return rows[0]?.id ?? "";
}

const claim = (dropId: string, memberId: string, position: number, key = randomUUID()) =>
  db.query("INSERT INTO claims (drop_id, member_id, position, idempotency_key) VALUES ($1, $2, $3, $4)", [
    dropId,
    memberId,
    position,
    key,
  ]);

describe("claims", () => {
  it("allows one claim per member per drop", async () => {
    const [d, m] = await Promise.all([drop(), member()]);
    await claim(d, m, 1);
    await expectPgError(claim(d, m, 2), UNIQUE_VIOLATION);
  });

  it("allows the same member to claim different drops", async () => {
    const [d1, d2, m] = await Promise.all([drop(), drop(), member()]);
    await claim(d1, m, 1);
    await expect(claim(d2, m, 1)).resolves.toBeDefined();
  });

  // Idempotency keys are client-generated and scoped to (drop, member), so one member's key can't block another's
  // claim. SPEC §5 originally had a global unique(idempotency_key); see migration 0002.
  it("lets member B claim with the same idempotency key member A used", async () => {
    const [d, a, b] = await Promise.all([drop(), member(), member()]);
    const key = randomUUID();
    await claim(d, a, 1, key);
    await expect(claim(d, b, 2, key)).resolves.toBeDefined();
    const { rows } = await db.query<{ member_id: string; position: number }>(
      "SELECT member_id, position FROM claims WHERE drop_id = $1 AND idempotency_key = $2 ORDER BY position",
      [d, key],
    );
    expect(rows).toEqual([
      { member_id: a, position: 1 },
      { member_id: b, position: 2 },
    ]);
  });

  it("lets a member reuse a key on a different drop", async () => {
    const [d1, d2, m] = await Promise.all([drop(), drop(), member()]);
    const key = randomUUID();
    await claim(d1, m, 1, key);
    await expect(claim(d2, m, 1, key)).resolves.toBeDefined();
  });

  it("still rejects a second claim by the same member, with the same or a different key", async () => {
    const [d, m] = await Promise.all([drop(), member()]);
    const key = randomUUID();
    await claim(d, m, 1, key);
    await expectPgError(claim(d, m, 2, key), UNIQUE_VIOLATION);
    await expectPgError(claim(d, m, 2), UNIQUE_VIOLATION);
  });

  it("rejects two claims at the same position in a drop", async () => {
    const [d, m1, m2] = await Promise.all([drop(), member(), member()]);
    await claim(d, m1, 1);
    await expectPgError(claim(d, m2, 1), UNIQUE_VIOLATION);
  });

  it("rejects positions outside 1..total_qty", async () => {
    const [d, m] = await Promise.all([drop(5), member()]);
    await expectPgError(claim(d, m, 0), CHECK_VIOLATION);
    await expectPgError(claim(d, m, 6), CHECK_VIOLATION);
  });

  it("rejects claims for unknown drops or members", async () => {
    const m = await member();
    await expectPgError(claim(randomUUID(), m, 1), FK_VIOLATION);
  });
});

describe("drops.total_qty is frozen once a drop is live", () => {
  const setQty = (d: string, qty: number) => db.query("UPDATE drops SET total_qty = $2 WHERE id = $1", [d, qty]);

  it("can change before the drop starts, while it has no claims", async () => {
    const d = await drop(500, "1 hour");
    await expect(setQty(d, 400)).resolves.toBeDefined();
  });

  it("can't change after the drop starts", async () => {
    const d = await drop(500);
    await expectPgError(setQty(d, 400), CHECK_VIOLATION);
  });

  it("can't change once a claim exists", async () => {
    const [d, m] = await Promise.all([drop(500, "1 hour"), member()]);
    await claim(d, m, 1);
    await expectPgError(setQty(d, 400), CHECK_VIOLATION);
  });

  it("can't be lowered underneath an in-flight claim insert (the race from review)", async () => {
    // T1 inserts a claim at position 480 and holds its transaction open; T2 lowers total_qty to 400.
    // Without locking, both could commit, leaving a claim past total_qty.
    const [d, m] = await Promise.all([drop(500, "1 hour"), member()]);
    const t1 = await db.connect();
    const t2 = await db.connect();
    try {
      await t1.query("BEGIN");
      await t1.query("INSERT INTO claims (drop_id, member_id, position, idempotency_key) VALUES ($1, $2, 480, $3)", [
        d,
        m,
        randomUUID(),
      ]);
      const lowering = t2.query("UPDATE drops SET total_qty = 400 WHERE id = $1", [d]).then(
        () => null,
        (e: unknown) => e,
      );
      await new Promise((r) => setTimeout(r, 200)); // T2 is now blocked on T1's FOR SHARE row lock
      await t1.query("COMMIT");

      expect(pgCode(await lowering)).toBe(CHECK_VIOLATION);
      const { rows } = await db.query<{ total_qty: number }>("SELECT total_qty FROM drops WHERE id = $1", [d]);
      expect(rows[0]?.total_qty).toBe(500);
    } finally {
      await t1.query("ROLLBACK").catch(() => undefined);
      t1.release();
      t2.release();
    }
  });
});

describe("points_ledger", () => {
  const award = (memberId: string, refId: string, delta = 50) =>
    db.query("INSERT INTO points_ledger (member_id, delta, reason, ref_id) VALUES ($1, $2, 'drop_claim', $3)", [
      memberId,
      delta,
      refId,
    ]);

  it("prevents double-awarding for the same reason and ref", async () => {
    const m = await member();
    const ref = randomUUID();
    await award(m, ref);
    await expectPgError(award(m, ref), UNIQUE_VIOLATION);
  });

  it("is append-only: updates and deletes are rejected", async () => {
    const m = await member();
    await award(m, randomUUID());
    await expect(db.query("UPDATE points_ledger SET delta = 999 WHERE member_id = $1", [m])).rejects.toThrow(
      /append-only/,
    );
    await expect(db.query("DELETE FROM points_ledger WHERE member_id = $1", [m])).rejects.toThrow(/append-only/);
  });
});

describe("drops and members", () => {
  it("rejects a drop that ends before it starts, or has no inventory", async () => {
    const insert = (qty: number, ends: string) =>
      db.query(
        `INSERT INTO drops (title, sponsor, reward_name, reward_image_url, total_qty, starts_at, ends_at, challenge)
         VALUES ('t', 's', 'r', 'https://example.com/r.png', $1, now(), now() + $2::interval, '{}')`,
        [qty, ends],
      );
    await expectPgError(insert(10, "-1 minute"), CHECK_VIOLATION);
    await expectPgError(insert(0, "1 hour"), CHECK_VIOLATION);
  });

  it("rejects an unknown tier or challenge source", async () => {
    await expectPgError(db.query("INSERT INTO members (handle, tier) VALUES ('t_badtier', 'gold')"), CHECK_VIOLATION);
    const d = await drop();
    await expectPgError(db.query("UPDATE drops SET challenge_source = 'robot' WHERE id = $1", [d]), CHECK_VIOLATION);
  });

  it("enforces unique handles", async () => {
    const handle = `t_${randomBytes(6).toString("hex")}`;
    await db.query("INSERT INTO members (handle) VALUES ($1)", [handle]);
    await expectPgError(db.query("INSERT INTO members (handle) VALUES ($1)", [handle]), UNIQUE_VIOLATION);
  });
});

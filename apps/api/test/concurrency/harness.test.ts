// M0 harness check for `pnpm test:concurrency`: proves the suite drives real parallel load at real Redis
// over many connections and asserts on final state. M1 adds the claim tests (SPEC §15: 2,000 parallel claims
// against a 500-unit drop → exactly 500 CLAIMED). This is NOT the claim script. The guarded decrement below
// lives only in this test, on a throwaway key, to show the harness can detect an oversell if one happens.
import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testRedisUrl } from "../setup/env";

const CONNECTIONS = 20;
const clients: Redis[] = [];

beforeAll(async () => {
  for (let i = 0; i < CONNECTIONS; i++) clients.push(new Redis(testRedisUrl, { lazyConnect: true }));
  await Promise.all(clients.map((c) => c.connect()));
});
afterAll(async () => {
  await Promise.all(clients.map((c) => c.quit()));
});

const client = (i: number) => clients[i % CONNECTIONS] as Redis; // index is always in range: i % CONNECTIONS

const GUARDED_DECR = `
local n = tonumber(redis.call('GET', KEYS[1]) or '0')
if n <= 0 then return -1 end
return redis.call('DECR', KEYS[1])
`;

describe("concurrency harness", () => {
  it("1,000 parallel INCRs across 20 connections all land", async () => {
    const key = `test:harness:${randomUUID()}`;
    try {
      await Promise.all(Array.from({ length: 1000 }, (_, i) => client(i).incr(key)));
      expect(await client(0).get(key)).toBe("1000");
    } finally {
      await client(0).del(key);
    }
  });

  it("2,000 parallel guarded decrements against 500 units succeed exactly 500 times", async () => {
    const key = `test:harness:${randomUUID()}`;
    try {
      await client(0).set(key, 500);
      const results = await Promise.all(
        Array.from({ length: 2000 }, (_, i) => client(i).eval(GUARDED_DECR, 1, key) as Promise<number>),
      );
      const won = results.filter((r) => r >= 0);
      expect(won).toHaveLength(500);
      expect(new Set(won).size).toBe(500); // every success saw a distinct remaining count
      expect(await client(0).get(key)).toBe("0");
    } finally {
      await client(0).del(key);
    }
  });
});

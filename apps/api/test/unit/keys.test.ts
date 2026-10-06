import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { keys } from "../../src/claims/keys";

const drop = randomUUID();
const memberA = randomUUID();
const memberB = randomUUID();
const key = "2b7e1c1a-4b7d-4c1e-9f0a-8d3c2b1a0e9f";

describe("idempotency key scoping", () => {
  it("gives member B a different cache key than member A for the same client key", () => {
    expect(keys.idempotency(drop, memberA, key)).not.toBe(keys.idempotency(drop, memberB, key));
  });

  it("gives the same member a different cache key on a different drop", () => {
    expect(keys.idempotency(drop, memberA, key)).not.toBe(keys.idempotency(randomUUID(), memberA, key));
  });

  it("is stable for the same (drop, member, key), so retries hit the cache", () => {
    expect(keys.idempotency(drop, memberA, key)).toBe(keys.idempotency(drop, memberA, key));
    expect(keys.idempotency(drop, memberA, key)).toBe(`idem:${drop}:${memberA}:${key}`);
  });

  it("rejects inputs that could forge another member's key", () => {
    // A ':' in the client key could otherwise shift the boundaries, e.g. key "<memberA>:<k>" from member B.
    expect(() => keys.idempotency(drop, memberB, `${memberA}:${key}`)).toThrow();
    expect(() => keys.idempotency(drop, `${memberB}:x`, key)).toThrow();
    expect(() => keys.idempotency(`${drop}:x`, memberA, key)).toThrow();
  });
});

describe("drop keys", () => {
  it("match SPEC §6", () => {
    expect(keys.remaining(drop)).toBe(`drop:${drop}:remaining`);
    expect(keys.claimed(drop)).toBe(`drop:${drop}:claimed`);
    expect(keys.admission(drop, 1791240834.9)).toBe(`admit:${drop}:1791240834`);
  });
});

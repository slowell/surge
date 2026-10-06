import { describe, expect, it } from "vitest";
import {
  ApiError,
  ChallengeDraftsResponse,
  ClaimRequest,
  ClaimResult,
  CreateDropRequest,
  DevLoginRequest,
  DropPublic,
  IdempotencyKey,
} from "./index";

const challenge = { question: "Which color is the mascot's scarf?", options: ["Red", "Teal", "Gold", "Plum"] };
const drop = {
  id: "4f1c2b9e-8a7d-4e3f-9b2a-1c0d5e6f7a8b",
  title: "Launch Week Drop",
  sponsor: "Lumen Soda Co.",
  rewardName: "Glow-in-the-dark enamel pin",
  rewardImageUrl: "https://example.com/pin.png",
  totalQty: 10_000,
  startsAt: "2026-10-06T17:00:00Z",
  endsAt: "2026-10-06T18:00:00Z",
};

describe("DropPublic", () => {
  it("accepts a drop without the answer", () => {
    expect(DropPublic.safeParse({ ...drop, challenge }).success).toBe(true);
  });

  it("rejects a drop that leaks the answer", () => {
    expect(DropPublic.safeParse({ ...drop, challenge: { ...challenge, answerIndex: 1 } }).success).toBe(false);
    expect(DropPublic.safeParse({ ...drop, challenge, answer_index: 1 }).success).toBe(false);
  });
});

describe("CreateDropRequest", () => {
  const valid = { ...drop, challenge: { ...challenge, answerIndex: 2 } };

  it("defaults challengeSource to human", () => {
    expect(CreateDropRequest.parse(valid).challengeSource).toBe("human");
  });

  it("rejects an end time before the start time", () => {
    const r = CreateDropRequest.safeParse({ ...valid, endsAt: "2026-10-06T16:00:00Z" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["endsAt"]);
  });

  it("rejects duplicate options, wrong option count, and out-of-range answers", () => {
    const opts = (options: string[]) => ({ ...valid, challenge: { ...valid.challenge, options } });
    expect(CreateDropRequest.safeParse(opts(["A", "a", "B", "C"])).success).toBe(false);
    expect(CreateDropRequest.safeParse(opts(["A", "B", "C"])).success).toBe(false);
    expect(CreateDropRequest.safeParse({ ...valid, challenge: { ...challenge, answerIndex: 4 } }).success).toBe(false);
  });

  it("rejects zero or fractional quantity", () => {
    expect(CreateDropRequest.safeParse({ ...valid, totalQty: 0 }).success).toBe(false);
    expect(CreateDropRequest.safeParse({ ...valid, totalQty: 1.5 }).success).toBe(false);
  });
});

describe("ClaimRequest / ClaimResult", () => {
  it("bounds answerIndex to the option count", () => {
    expect(ClaimRequest.safeParse({ answerIndex: 3 }).success).toBe(true);
    expect(ClaimRequest.safeParse({ answerIndex: -1 }).success).toBe(false);
    expect(ClaimRequest.safeParse({ answerIndex: "1" }).success).toBe(false);
  });

  it("parses every expected outcome", () => {
    for (const status of ["SOLD_OUT", "ALREADY_CLAIMED", "NOT_OPEN", "CLOSED"] as const) {
      expect(ClaimResult.parse({ status }).status).toBe(status);
    }
    expect(ClaimResult.parse({ status: "CLAIMED", position: 4812, total: 10_000, points: 57 })).toMatchObject({
      position: 4812,
    });
  });

  it("requires position and points on CLAIMED", () => {
    expect(ClaimResult.safeParse({ status: "CLAIMED" }).success).toBe(false);
  });
});

describe("IdempotencyKey", () => {
  it("accepts a UUID and rejects short or unsafe keys", () => {
    expect(IdempotencyKey.safeParse("2b7e1c1a-4b7d-4c1e-9f0a-8d3c2b1a0e9f").success).toBe(true);
    expect(IdempotencyKey.safeParse("short").success).toBe(false);
    expect(IdempotencyKey.safeParse("has spaces in it").success).toBe(false);
  });
});

describe("DevLoginRequest", () => {
  it("normalizes handles to lowercase", () => {
    expect(DevLoginRequest.parse({ handle: "  Fan_42 " }).handle).toBe("fan_42");
  });
  it("rejects handles with unsupported characters", () => {
    expect(DevLoginRequest.safeParse({ handle: "fan-42!" }).success).toBe(false);
  });
});

describe("ApiError", () => {
  it("requires retry timing on WAITING_ROOM", () => {
    expect(ApiError.safeParse({ error: "WAITING_ROOM", message: "In line" }).success).toBe(false);
    expect(
      ApiError.safeParse({ error: "WAITING_ROOM", message: "In line", retryAfterMs: 800, estimatedWaitMs: 4000 })
        .success,
    ).toBe(true);
  });
});

describe("ChallengeDraftsResponse", () => {
  const draft = { ...challenge, answer_index: 0, rationale: "Shown in the launch video." };

  it("requires exactly three drafts", () => {
    expect(ChallengeDraftsResponse.safeParse({ drafts: [draft, draft, draft] }).success).toBe(true);
    expect(ChallengeDraftsResponse.safeParse({ drafts: [draft, draft] }).success).toBe(false);
  });

  it("enforces the 120-character question limit", () => {
    const long = { ...draft, question: "x".repeat(121) };
    expect(ChallengeDraftsResponse.safeParse({ drafts: [long, draft, draft] }).success).toBe(false);
  });
});

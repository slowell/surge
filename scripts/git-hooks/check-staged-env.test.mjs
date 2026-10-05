import { describe, expect, it } from "vitest";
import { findEnvFiles } from "./check-staged-env.mjs";

describe("findEnvFiles", () => {
  it.each([".env", ".env.local", "apps/api/.env", "apps/mobile/.env.development.local", ".env.production"])(
    "flags %s",
    (f) => expect(findEnvFiles([f])).toEqual([f]),
  );

  it.each([".env.example", "apps/api/.env.example", ".envrc", "apps/api/src/env.ts", "apps/api/my.env", "README.md"])(
    "allows %s",
    (f) => expect(findEnvFiles([f])).toEqual([]),
  );
});

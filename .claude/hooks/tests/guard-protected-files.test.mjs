import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { runHook, edit, MALFORMED_PAYLOADS } from "./helpers.mjs";

const HOOK = "guard-protected-files.mjs";
const WIN_ROOT = "C:\\Users\\dev\\surge";
const POSIX_ROOT = "/home/dev/surge";

const check = (file_path, projectDir) => runHook(HOOK, edit(file_path), { projectDir });

describe("blocks protected files", () => {
  const protectedFiles = [
    ".env",
    ".env.local",
    ".env.production",
    ".env.example.bak",
    "apps/api/.env",
    "apps/api/.env.test",
    "apps/mobile/.env.local",
    "packages/shared/.env.example.old",
    "pnpm-lock.yaml",
    "apps/mobile/pnpm-lock.yaml",
    "apps/api/migrations/applied/0001_init.sql",
    "load/results/2026-10-05/summary.json",
  ];
  for (const file of protectedFiles) {
    test(`posix: ${file}`, () => {
      const { code, stderr } = check(`${POSIX_ROOT}/${file}`, POSIX_ROOT);
      assert.equal(code, 2);
      assert.match(stderr, new RegExp(`Blocked edit to ${file.replaceAll(".", "\\.")}`));
    });
    test(`windows backslashes: ${file}`, () => {
      const { code, stderr } = check(`${WIN_ROOT}\\${file.replaceAll("/", "\\")}`, WIN_ROOT);
      assert.equal(code, 2);
      assert.match(stderr, /Blocked edit to/);
    });
  }
  test("windows forward slashes", () => {
    assert.equal(check("C:/Users/dev/surge/apps/api/.env", WIN_ROOT).code, 2);
  });
  test("windows path with different drive-letter and folder case", () => {
    assert.equal(check("c:\\users\\dev\\SURGE\\apps\\api\\.env", WIN_ROOT).code, 2);
  });
  test("relative path resolves against the project root", () => {
    assert.equal(check("apps\\api\\.env", WIN_ROOT).code, 2);
    assert.equal(check("apps/api/.env", POSIX_ROOT).code, 2);
  });
});

describe("allows everything else", () => {
  for (const file of [".env.example", "apps/api/.env.example", "apps/mobile/.env.example", ".envrc", "apps/api/src/env.ts", "apps/api/my.env", "apps/api/migrations/0002_new.sql", "load/k6/spike.js", "BUILD_LOG.md"]) {
    test(`posix: ${file}`, () => assert.equal(check(`${POSIX_ROOT}/${file}`, POSIX_ROOT).code, 0));
    test(`windows: ${file}`, () => assert.equal(check(`${WIN_ROOT}\\${file.replaceAll("/", "\\")}`, WIN_ROOT).code, 0));
  }
});

describe("fails closed on a bad payload", () => {
  for (const [name, raw] of Object.entries(MALFORMED_PAYLOADS)) {
    test(name, () => {
      const { code, stderr } = runHook(HOOK, undefined, { projectDir: WIN_ROOT, raw });
      assert.equal(code, 2);
      assert.match(stderr, /guard-protected-files: the hook payload was missing or was not valid JSON/);
    });
  }
  test("payload without a file path", () => {
    const { code, stderr } = runHook(HOOK, { tool_name: "Edit", tool_input: {} }, { projectDir: WIN_ROOT });
    assert.equal(code, 2);
    assert.match(stderr, /no file path/);
  });
});

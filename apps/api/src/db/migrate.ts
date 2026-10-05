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

export function migrate(_client: pg.Client, _opts: MigrateOptions): Promise<MigrateResult> {
  return Promise.reject(new Error("not implemented"));
}

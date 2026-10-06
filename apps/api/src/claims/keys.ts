// Redis key names (SPEC §6). Every key the claim path touches is built here, so scoping can't drift.
import { Id, IdempotencyKey } from "@surge/shared";

export const keys = {
  meta: (dropId: string) => `drop:${Id.parse(dropId)}:meta`,
  remaining: (dropId: string) => `drop:${Id.parse(dropId)}:remaining`,
  claimed: (dropId: string) => `drop:${Id.parse(dropId)}:claimed`,
  dropLeaderboard: (dropId: string) => `drop:${Id.parse(dropId)}:lb`,
  globalLeaderboard: () => "lb:global",
  /**
   * Cached claim response for idempotent retries. Scoped to (drop, member) because the key is client-generated:
   * member B sending member A's key must never read A's cached result (SPEC §6, migration 0002).
   * Every part is validated: UUIDs and IdempotencyKey can't contain ":", so distinct inputs can't collide.
   */
  idempotency: (dropId: string, memberId: string, key: string) =>
    `idem:${Id.parse(dropId)}:${Id.parse(memberId)}:${IdempotencyKey.parse(key)}`,
  admission: (dropId: string, epochSecond: number) => `admit:${Id.parse(dropId)}:${Math.floor(epochSecond)}`,
};

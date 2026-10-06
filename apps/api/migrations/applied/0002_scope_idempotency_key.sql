-- 0002_scope_idempotency_key: fixes two issues the concurrency-reviewer found in 0001_init during M0.

-- 1. Idempotency keys are client-generated, so a global unique(idempotency_key) let one member's key collide
--    with another's: member B reusing member A's key would make B's claim fail to persist (or, with a global
--    Redis cache key, be served A's result). Keys are now scoped to (drop, member), matching the Redis key
--    idem:{dropId}:{memberId}:{key} (SPEC §5, §6).
--    Note: unique(drop_id, member_id) already implies this triple is unique. The constraint exists to state
--    the scoping explicitly and to back the worker's (drop, member, key) lookup with an index.
ALTER TABLE claims DROP CONSTRAINT claims_idempotency_key_key;
ALTER TABLE claims
  ADD CONSTRAINT claims_drop_member_idempotency_key_key UNIQUE (drop_id, member_id, idempotency_key);

-- 2. The position trigger read drops.total_qty without a lock, so a concurrent decrease of total_qty could
--    commit alongside a claim past the new total. Now:
--    a) the claims trigger reads total_qty FOR SHARE, which conflicts with a concurrent UPDATE of the row, and
--    b) total_qty can't change once a drop has started or has any claims (Redis inventory is set at arm time),
--       and starts_at can't change once the drop has started, so total_qty can't be unfrozen by first moving
--       starts_at into the future while worker writes lag behind Redis.
-- Both functions must stay VOLATILE (the default): each statement then takes a fresh snapshot after a lock wait,
-- so the frozen check sees a claim committed while it waited. STABLE/IMMUTABLE would reuse the UPDATE's snapshot.
-- Admin drop edits must run in READ COMMITTED (the default) for the same reason.
CREATE OR REPLACE FUNCTION claims_position_within_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  qty int;
BEGIN
  SELECT total_qty INTO qty FROM drops WHERE id = NEW.drop_id FOR SHARE;
  IF NEW.position > qty THEN
    RAISE EXCEPTION 'claim position % exceeds total_qty for drop %', NEW.position, NEW.drop_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION drops_inventory_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.starts_at IS DISTINCT FROM OLD.starts_at AND OLD.starts_at <= now() THEN
    RAISE EXCEPTION 'starts_at of drop % is frozen once the drop has started', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.total_qty <> OLD.total_qty
     AND (OLD.starts_at <= now() OR EXISTS (SELECT 1 FROM claims WHERE drop_id = OLD.id)) THEN
    RAISE EXCEPTION 'total_qty of drop % is frozen once the drop has started or has claims', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER drops_inventory_frozen
  BEFORE UPDATE OF total_qty, starts_at ON drops
  FOR EACH ROW EXECUTE FUNCTION drops_inventory_frozen();

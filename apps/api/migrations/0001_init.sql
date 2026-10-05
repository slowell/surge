-- 0001_init: members, drops, claims, points ledger (SPEC §5).
-- Redis is authoritative during a live drop; these constraints are the durable backstop the worker writes against.

CREATE TABLE members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle     text NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9_]{3,24}$'),
  tier       text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'plus')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE drops (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  sponsor          text NOT NULL,
  reward_name      text NOT NULL,
  reward_image_url text NOT NULL,
  total_qty        int  NOT NULL CHECK (total_qty > 0),
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  -- {question, options[], answer_index}. The answer is never sent to clients.
  challenge        jsonb NOT NULL,
  challenge_source text NOT NULL DEFAULT 'human' CHECK (challenge_source IN ('human', 'ai_assisted')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX drops_starts_at_idx ON drops (starts_at);

CREATE TABLE claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id         uuid NOT NULL REFERENCES drops (id),
  member_id       uuid NOT NULL REFERENCES members (id),
  position        int  NOT NULL CHECK (position > 0),
  idempotency_key text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (drop_id, member_id),
  UNIQUE (idempotency_key),
  -- Each position is handed out once; a duplicate means the Redis counter misbehaved.
  UNIQUE (drop_id, position)
);
CREATE INDEX claims_member_id_idx ON claims (member_id);

-- A position past total_qty is an oversell. CHECK can't see drops.total_qty, so a trigger enforces it.
CREATE FUNCTION claims_position_within_total() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.position > (SELECT total_qty FROM drops WHERE id = NEW.drop_id) THEN
    RAISE EXCEPTION 'claim position % exceeds total_qty for drop %', NEW.position, NEW.drop_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER claims_position_within_total
  BEFORE INSERT OR UPDATE OF position, drop_id ON claims
  FOR EACH ROW EXECUTE FUNCTION claims_position_within_total();

CREATE TABLE points_ledger (
  id         bigserial PRIMARY KEY,
  member_id  uuid NOT NULL REFERENCES members (id),
  delta      int  NOT NULL CHECK (delta <> 0),
  reason     text NOT NULL,
  ref_id     uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Prevents double-award, e.g. one 'drop_claim' entry per claim id.
  UNIQUE (reason, ref_id)
);
CREATE INDEX points_ledger_member_id_idx ON points_ledger (member_id);

-- Append-only: balance = sum(delta). Corrections are new rows, never edits.
CREATE FUNCTION points_ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'points_ledger is append-only; insert a correcting entry instead'
    USING ERRCODE = 'restrict_violation';
END
$$;
CREATE TRIGGER points_ledger_no_update_delete
  BEFORE UPDATE OR DELETE ON points_ledger
  FOR EACH ROW EXECUTE FUNCTION points_ledger_append_only();
CREATE TRIGGER points_ledger_no_truncate
  BEFORE TRUNCATE ON points_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION points_ledger_append_only();

-- SELECT-only role for the Postgres MCP server (.mcp.json → DATABASE_URL_READONLY).
-- Idempotent: safe to re-run. Run as the database owner, so the default privileges
-- below cover tables that later migrations create.
--   Local, fresh volume: runs automatically via docker-entrypoint-initdb.d
--   Local, existing volume or CI: pnpm db:readonly-role
--   Supabase/prod: run this, then immediately set a real password:
--     ALTER ROLE surge_readonly PASSWORD '<generated>';
-- The password below is the local placeholder from .env.example. Never reuse it outside docker.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'surge_readonly') THEN
    CREATE ROLE surge_readonly LOGIN PASSWORD 'readonly'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

-- Defense in depth: even if a write grant slips in later, every transaction is read-only.
ALTER ROLE surge_readonly SET default_transaction_read_only = on;
ALTER ROLE surge_readonly CONNECTION LIMIT 5;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO surge_readonly', current_database());
END
$$;

REVOKE CREATE ON SCHEMA public FROM surge_readonly;
GRANT USAGE ON SCHEMA public TO surge_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO surge_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO surge_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO surge_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO surge_readonly;

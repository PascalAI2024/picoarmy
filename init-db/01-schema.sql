-- PicoArmy Maximus Schema
-- Runs on first boot via docker-entrypoint-initdb.d

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema for PostgREST
CREATE SCHEMA IF NOT EXISTS api;

-- ── Bot Registry ─────────────────────────────────────────────────
CREATE TABLE api.bots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    soul_name TEXT NOT NULL DEFAULT 'assistant',
    status TEXT NOT NULL DEFAULT 'offline',
    is_permanent BOOLEAN NOT NULL DEFAULT true,
    ttl_seconds INTEGER,
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- ── Firmware Updates ─────────────────────────────────────────────
CREATE TABLE api.updates (
    id SERIAL PRIMARY KEY,
    version TEXT NOT NULL UNIQUE,
    binary_url TEXT,
    payload TEXT,
    is_latest BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Telemetry & Logs ─────────────────────────────────────────────
CREATE TABLE api.telemetry (
    id SERIAL PRIMARY KEY,
    bot_id UUID REFERENCES api.bots(id) ON DELETE CASCADE,
    level TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast bot telemetry queries
CREATE INDEX idx_telemetry_bot_id ON api.telemetry(bot_id);
CREATE INDEX idx_telemetry_timestamp ON api.telemetry(timestamp DESC);
CREATE INDEX idx_telemetry_metadata ON api.telemetry USING GIN(metadata);

-- ── Triggers ─────────────────────────────────────────────────────

-- Handle 'is_latest' logic for firmware updates
CREATE OR REPLACE FUNCTION api.set_latest_update()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_latest THEN
        UPDATE api.updates SET is_latest = false WHERE id <> NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_latest_update
BEFORE INSERT OR UPDATE ON api.updates
FOR EACH ROW EXECUTE FUNCTION api.set_latest_update();

-- ── Views ────────────────────────────────────────────────────────

-- Latest firmware for bot sync
CREATE OR REPLACE VIEW api.latest_firmware AS
SELECT version, binary_url, payload
FROM api.updates
WHERE is_latest = true
LIMIT 1;

-- ── Roles ────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_anon') THEN
        CREATE ROLE web_anon NOLOGIN;
    END IF;
END $$;

GRANT USAGE ON SCHEMA api TO web_anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON api.bots TO web_anon;
GRANT SELECT ON api.updates TO web_anon;
GRANT SELECT, INSERT ON api.telemetry TO web_anon;
GRANT SELECT ON api.latest_firmware TO web_anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA api TO web_anon;

-- ── Seed Data ────────────────────────────────────────────────────

INSERT INTO api.bots (name, soul_name, status, is_permanent, last_heartbeat) VALUES
    ('mom-helper', 'assistant', 'online', true, NOW()),
    ('seo-acme', 'seo-writer', 'online', true, NOW() - INTERVAL '2 minutes'),
    ('task-runner-1', 'assistant', 'idle', false, NOW() - INTERVAL '4 minutes');

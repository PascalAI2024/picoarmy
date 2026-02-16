-- Initialize PicoArmy Maximus Schema

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema for PostgREST
CREATE SCHEMA api;

-- Bot Registry
CREATE TABLE api.bots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    status TEXT DEFAULT 'offline',
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    firmware_version TEXT DEFAULT 'v0.0.0',
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Update Registry
CREATE TABLE api.updates (
    id SERIAL PRIMARY KEY,
    version TEXT NOT NULL UNIQUE,
    binary_url TEXT, -- Or store the blob if tiny
    payload TEXT,    -- For script-based updates
    is_latest BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Telemetry & Logs
CREATE TABLE api.telemetry (
    id SERIAL PRIMARY KEY,
    bot_id UUID REFERENCES api.bots(id),
    activity TEXT NOT NULL,
    data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to handle 'is_latest' logic
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

-- View for bots to fetch their latest update
CREATE OR REPLACE VIEW api.latest_firmware AS
SELECT version, binary_url, payload
FROM api.updates
WHERE is_latest = true
LIMIT 1;

-- Roles for PostgREST
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_anon') THEN
        CREATE ROLE web_anon nologin;
    END IF;
END $$;

GRANT USAGE ON SCHEMA api TO web_anon;
GRANT SELECT, INSERT, UPDATE ON api.bots TO web_anon;
GRANT SELECT ON api.updates TO web_anon;
GRANT INSERT ON api.telemetry TO web_anon;
GRANT SELECT ON api.latest_firmware TO web_anon;

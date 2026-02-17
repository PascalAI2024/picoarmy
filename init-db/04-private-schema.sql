-- Private Schema & Souls/Skills Tables
-- Run after 03-rls.sql
-- Adds versioned soul/skill storage + automated bot status maintenance

-- ── Private Schema ───────────────────────────────────────────────
-- Private schema for internal functions, not exposed via PostgREST
CREATE SCHEMA IF NOT EXISTS private;

-- ── Souls Table ──────────────────────────────────────────────────
-- Versioned soul templates with full content storage
CREATE TABLE IF NOT EXISTS api.souls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_souls_name ON api.souls(name);
CREATE INDEX IF NOT EXISTS idx_souls_updated ON api.souls(updated_at DESC);

-- ── Skills Table ─────────────────────────────────────────────────
-- Versioned skill packages with content storage
CREATE TABLE IF NOT EXISTS api.skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    content TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    category TEXT DEFAULT 'general',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_skills_name ON api.skills(name);
CREATE INDEX IF NOT EXISTS idx_skills_category ON api.skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_updated ON api.skills(updated_at DESC);

-- ── Triggers ─────────────────────────────────────────────────────

-- Auto-increment version on content update
CREATE OR REPLACE FUNCTION api.increment_soul_version()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.content IS DISTINCT FROM NEW.content THEN
        NEW.version := OLD.version + 1;
        NEW.updated_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_soul_version
BEFORE UPDATE ON api.souls
FOR EACH ROW EXECUTE FUNCTION api.increment_soul_version();

CREATE OR REPLACE FUNCTION api.increment_skill_version()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.content IS DISTINCT FROM NEW.content THEN
        NEW.version := OLD.version + 1;
        NEW.updated_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_skill_version
BEFORE UPDATE ON api.skills
FOR EACH ROW EXECUTE FUNCTION api.increment_skill_version();

-- ── Maintenance Functions ────────────────────────────────────────

-- Mark bots offline if no heartbeat for 5+ minutes
-- Called via pg_cron or manually for cleanup
CREATE OR REPLACE FUNCTION private.mark_offline()
RETURNS TABLE(affected_count BIGINT) AS $$
BEGIN
    WITH updated AS (
        UPDATE api.bots
        SET status = 'offline'
        WHERE last_heartbeat < NOW() - INTERVAL '5 minutes'
          AND status != 'offline'
        RETURNING id
    )
    SELECT COUNT(*) FROM updated INTO affected_count;

    RETURN QUERY SELECT affected_count;
END;
$$ LANGUAGE plpgsql;

-- ── Permissions ──────────────────────────────────────────────────

-- Grant read/write on souls and skills to web_anon
GRANT SELECT, INSERT, UPDATE, DELETE ON api.souls TO web_anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON api.skills TO web_anon;
-- Note: No sequence grants needed — tables use UUID PKs, not SERIAL

-- Grant execute on maintenance function to commander role
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'commander') THEN
        CREATE ROLE commander LOGIN PASSWORD 'set_in_env';
    END IF;
END $$;

GRANT EXECUTE ON FUNCTION private.mark_offline() TO commander;

-- ── Seed Data ────────────────────────────────────────────────────

-- Seed souls from filesystem (if not already present)
INSERT INTO api.souls (name, description, content, version) VALUES
    ('assistant', 'Capable personal assistant', 'Default assistant soul template', 1),
    ('seo-writer', 'SEO content specialist', 'Default SEO writer soul template', 1),
    ('support-agent', 'Customer support specialist', 'Default support agent soul template', 1)
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE api.souls IS 'Versioned soul templates for bot personalities';
COMMENT ON TABLE api.skills IS 'Versioned skill packages deployable to bots';
COMMENT ON FUNCTION private.mark_offline() IS 'Mark bots offline if no heartbeat for 5+ minutes';

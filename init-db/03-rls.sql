-- Row Level Security Policies
-- Enforces client_id isolation when accessed via PostgREST.
--
-- How it works:
-- PostgREST 14 stores all request headers as a JSON object in the
-- transaction-scoped GUC `request.headers`. We extract `x-client-id`
-- from that JSON. When present, rows are filtered to match.
-- When absent (Commander internal calls), all rows are visible.
--
-- This is real RLS — not GRANT-based access control.

-- Helper: extract x-client-id from PostgREST request headers JSON.
-- Returns NULL when no header is set (Commander mode = sees everything).
CREATE OR REPLACE FUNCTION api.get_client_id()
RETURNS TEXT AS $$
  SELECT current_setting('request.headers', true)::json->>'x-client-id';
$$ LANGUAGE sql STABLE;

-- ── Enable RLS on all API tables ─────────────────────────────────

ALTER TABLE api.bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE api.telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE api.mcp_tool_calls ENABLE ROW LEVEL SECURITY;

-- Note: api.updates and api.latest_firmware are global (not client-scoped)

-- ── Bots: client_id isolation ────────────────────────────────────

-- Commander (db owner) bypasses RLS automatically.
-- web_anon sees all bots when no client filter is set,
-- or only matching bots when x-client-id header is provided.
CREATE POLICY bots_client_isolation ON api.bots
    FOR ALL
    TO web_anon
    USING (
        -- No client header = show all (Commander mode)
        api.get_client_id() IS NULL
        OR
        -- Client header set = only matching rows
        client_id = api.get_client_id()
    );

-- ── Telemetry: bot ownership ────────────────────────────────────

CREATE POLICY telemetry_client_isolation ON api.telemetry
    FOR ALL
    TO web_anon
    USING (
        api.get_client_id() IS NULL
        OR
        bot_id IN (
            SELECT id FROM api.bots
            WHERE client_id = api.get_client_id()
        )
    );

-- ── MCP Tool Calls: client_id isolation ─────────────────────────

CREATE POLICY mcp_calls_client_isolation ON api.mcp_tool_calls
    FOR ALL
    TO web_anon
    USING (
        api.get_client_id() IS NULL
        OR
        client_id = api.get_client_id()
    );

-- ── Permissions for helper function ─────────────────────────────

GRANT EXECUTE ON FUNCTION api.get_client_id() TO web_anon;

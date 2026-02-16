-- MCP Integration Schema
-- Run after 01-schema.sql

-- Add client_id to bots for MCP tool scoping
ALTER TABLE api.bots ADD COLUMN IF NOT EXISTS client_id TEXT;
CREATE INDEX IF NOT EXISTS idx_bots_client_id ON api.bots(client_id);

-- Tool call audit log
CREATE TABLE IF NOT EXISTS api.mcp_tool_calls (
    id SERIAL PRIMARY KEY,
    bot_id UUID REFERENCES api.bots(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    server_name TEXT NOT NULL,
    arguments JSONB DEFAULT '{}'::jsonb,
    result JSONB,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, success, error, denied
    client_id TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_bot ON api.mcp_tool_calls(bot_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_created ON api.mcp_tool_calls(created_at DESC);

-- Grant permissions
GRANT SELECT, INSERT ON api.mcp_tool_calls TO web_anon;
GRANT USAGE, SELECT ON api.mcp_tool_calls_id_seq TO web_anon;

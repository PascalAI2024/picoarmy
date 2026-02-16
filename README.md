# PicoArmy Maximus: The Fleet Command Center

> A PostgreSQL-first management layer for [louisho5/picobot](https://github.com/louisho5/picobot) fleets.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Commander (Node.js/Express)            :4000               │
│  ├── Dashboard (Vite React)             /                   │
│  ├── Fleet API                          /api/fleet          │
│  ├── MCP Hub (17 tools)                 /api/tools          │
│  ├── SSE Telemetry                      /api/sse            │
│  └── Process Manager                                        │
│       ├── mom-helper     (permanent, workspace: data/bots/) │
│       ├── seo-acme       (permanent, client_id: acme)       │
│       └── task-runner-1  (ephemeral, TTL=2h)                │
├─────────────────────────────────────────────────────────────┤
│  MCP Servers (stdio)                                        │
│  ├── Z.AI    → 8 tools  (vision, web search, GitHub)        │
│  └── MiniMax → 9 tools  (TTS, video, image, music)          │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL 15          :5432                                │
│  ├── api.bots           (fleet registry + RLS)              │
│  ├── api.telemetry      (JSONB activity logs + RLS)         │
│  ├── api.mcp_tool_calls (audit log + RLS)                   │
│  └── api.updates        (firmware versioning)               │
├─────────────────────────────────────────────────────────────┤
│  PostgREST 14           :3000                                │
│  └── Auto-REST from api schema                              │
└─────────────────────────────────────────────────────────────┘
```

## Getting Started

```bash
# 1. Start the database
docker compose up -d

# 2. Start the Commander + Dashboard
npm run dev

# 3. Open the dashboard
open http://localhost:4000
```

PostgREST API is at `http://localhost:3000`. Commander API is at `http://localhost:4000/api`.

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/fleet` | List all bots |
| `POST` | `/api/fleet` | Spawn a new bot |
| `DELETE` | `/api/fleet/:id` | Destroy a bot |
| `PATCH` | `/api/fleet/:id/settings` | Update bot config (provider, model, client_id, telegram) |
| `POST` | `/api/fleet/:id/soul` | Deploy soul template |
| `GET` | `/api/souls` | List available soul templates |
| `GET` | `/api/providers` | List configured LLM provider presets |
| `GET` | `/api/tools` | List all MCP tools (filter: `?bot=name`) |
| `POST` | `/api/tools/:name/call` | Execute MCP tool (body: `{arguments, bot_name}`) |
| `GET` | `/api/mcp/status` | MCP hub connection status |
| `GET` | `/api/sse` | Server-Sent Events stream |

## MCP Tool Integration

Commander acts as a universal MCP client hub. Bots request tools via `HEARTBEAT.md`, Commander proxies through connected MCP servers with scope enforcement.

**Connected servers** (configured in `mcp-servers.json`):
- **Z.AI** — 8 tools: vision analysis, web search, GitHub exploration (GLM-4.6V powered)
- **MiniMax** — 9 tools: text-to-speech, video generation, image generation, music

**Scope guard**: Tools scoped `"shared"` are available to all bots. Tools scoped `"client:<id>"` are restricted to bots with matching `client_id`.

## IPC Channels

Bots are Go processes with no HTTP API. Communication is via filesystem:

| File | Owner | Direction | Purpose |
|------|-------|-----------|---------|
| `HEARTBEAT.md` | Bot | Bot → Commander | Tool requests (polled every 10s) |
| `COMMANDS.md` | Commander | Commander → Bot | Commands (appended, read on next tick) |
| `TOOL_RESULT_{id}.json` | Commander | Commander → Bot | Tool call results |
| `config.json` | Commander | Commander → Bot | LLM and Telegram config |
| `workspace/SOUL.md` | Commander | Commander → Bot | Agent personality |

Channels are separated to prevent race conditions between tool requests and commands.

## Security

- **RLS (Row Level Security):** Enabled on `api.bots`, `api.telemetry`, and `api.mcp_tool_calls`. Policies filter rows by `x-client-id` request header via `api.get_client_id()`. Commander (no header) sees all rows; clients see only their scoped data.
- **MCP Scope Guard:** Tool access is enforced per `client_id` — bots scoped to client A cannot invoke tools restricted to client B.
- **Audit Logs:** All MCP tool calls are logged to `api.mcp_tool_calls` with bot, tool, arguments, result, and duration.
- **Zombie Reaping:** On startup, Commander kills orphaned bot processes from previous sessions via persisted PID files in `data/pids/`.

## LLM Provider Presets

| Preset | Model | Format | Cost |
|--------|-------|--------|------|
| `glm-flash` | GLM-4.7-Flash | OpenAI | Free (unlimited) |
| `glm-coding` | GLM-4.7 | OpenAI | Coding plan (~$3-15/mo) |
| `glm` | GLM-4.7 | OpenAI | Pay-per-token |
| `minimax` | MiniMax-M2.1 | OpenAI | Coding plan (~$10-50/mo) |
| `minimax-anthropic` | MiniMax-M2.1 | Anthropic | Same key, Anthropic format |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Database | PostgreSQL 15 + RLS |
| API | PostgREST 14 (auto-REST) |
| Commander | TypeScript + Express |
| MCP | @modelcontextprotocol/sdk |
| Dashboard | Vite + React + Zustand + Radix UI |
| Agent | louisho5/picobot (Go, ~8MB) |
| Infra | Docker Compose |

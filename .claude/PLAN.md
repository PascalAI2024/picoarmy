# PicoArmy — Development Plan

> Fleet Command Center for louisho5/picobot
> Single container: Postgres + PostgREST + Commander + N picobot processes
> Deployed as one Dokploy app on Contabo VPS

## Phase 1: Foundation

### 1.1 Schema Hardening
- [x] `api.bots` table — fleet registry with status, config, heartbeat, client_id
- [x] `api.updates` table — firmware versions with `is_latest` trigger
- [x] `api.telemetry` table — JSONB activity logs with GIN index
- [x] `api.mcp_tool_calls` table — MCP tool call audit log
- [x] `api.latest_firmware` view — current firmware for bot sync
- [x] RLS policies on bots, telemetry, mcp_tool_calls (client_id isolation via x-client-id header)
- [x] Roles: `web_anon` (PostgREST anon), `commander` (db owner, bypasses RLS)
- [ ] Add `private` schema for internal functions/triggers
- [ ] `api.souls` table — versioned SOUL.md storage per bot
- [ ] `api.skills` table — modular skill packages
- [ ] `private.mark_offline()` function — mark stale bots via pg_cron
- [ ] `bot_role` — JWT-authenticated per-bot role

### 1.2 Dockerfile (Single Container)
- [ ] Multi-stage build: Postgres 15 + PostgREST binary + Node.js + picobot binary
- [ ] Supervisord or custom entrypoint to manage processes
- [ ] Volume at `/data/` for persistent state
- [ ] Entrypoint: start Postgres → run init-db → start PostgREST → start Commander
- [ ] Commander auto-starts permanent bots from DB on boot
- [ ] Health check endpoint for Dokploy

### 1.3 Process Manager (process-manager.ts)
- [x] Spawn picobot as child process with per-bot env vars and workspace dir
- [x] Process health monitoring — restart crashed bots (max 5 attempts)
- [x] Graceful shutdown — SIGTERM propagation to all children
- [x] TTL tracking — kill ephemeral bots when expired
- [x] PID persistence (`data/pids/`) + zombie reaping on startup
- [x] Separate IPC channels — COMMANDS.md (commander→bot), HEARTBEAT.md (bot→commander)
- [x] MCP tool request polling from HEARTBEAT.md (10s interval)
- [ ] Boot sequence — read DB, start all permanent bots

### 1.4 Commander Core (commander.ts)
- [x] Express server with API routes + SSE + static dashboard serving
- [x] `POST /api/fleet` — Create bot record + write workspace + start process
- [x] `DELETE /api/fleet/:id` — Kill process + cleanup
- [x] `GET /api/fleet` — All bots with status from PostgREST
- [x] `POST /api/fleet/:id/soul` — Deploy soul template
- [x] `GET /api/souls` — List available soul templates
- [x] `PATCH /api/fleet/:id/settings` — Update bot config (provider, model, client_id, telegram)
- [x] `GET /api/providers` — List configured LLM provider presets
- [x] SSE event stream for real-time fleet updates
- [ ] `send-command` via COMMANDS.md channel
- [ ] `logs` — Read bot memory/ dir for recent activity

### 1.5 MCP Client Hub (mcp-hub.ts)
- [x] MCPHub class — connects to MCP servers via stdio transport
- [x] Declarative config (`mcp-servers.json`) with env var interpolation
- [x] Tool discovery — `listTools()` across all connected servers
- [x] Scope guard — shared vs client-scoped tool access
- [x] Tool execution — `callTool()` with scope check + audit logging
- [x] API endpoints: `GET /api/tools`, `POST /api/tools/:name/call`, `GET /api/mcp/status`
- [x] Connected servers: Z.AI (8 tools), MiniMax (9 tools) = 17 total
- [x] Bot tool proxy — polls HEARTBEAT.md, writes TOOL_RESULT_{id}.json to workspace

### 1.6 Soul Templates & Skills Library
- [x] `souls/assistant.md` — Generic helpful assistant
- [x] `souls/seo-writer.md` — SEO content generator
- [x] `souls/support-agent.md` — Customer support bot
- [x] Template system: spawn with `--soul=assistant`
- [ ] Skills library at `/data/skills/` — master repo of deployable skills
- [ ] `deploy-skill` command — push skills to bots
- [ ] Starter skills: web-research, reminder-system, content-writer

### 1.7 Shared Knowledge Base
- [ ] `/data/shared/` directory structure (clients/, templates/, knowledge/)
- [ ] Commander links relevant knowledge into bot workspaces on spawn
- [ ] Per-client knowledge directories

### 1.8 Inter-Bot Pipelines
- [ ] Pipeline definition format (YAML or JSON)
- [ ] Pipeline runner in commander
- [ ] Built-in pipeline: blog-post (research → write → edit → publish)

## Phase 2: Interfaces

### 2.1 Web UI (Fleet Dashboard)
- [x] Vite React dashboard with command center aesthetic
- [x] Fleet status grid — all bots with live status indicators
- [x] Bot detail view — Overview, Soul, Skills, Telemetry, Actions, Settings, Tools tabs
- [x] Spawn/destroy controls — create permanent or ephemeral bots
- [x] Settings tab — provider, model, client_id, telegram config, soul template
- [x] Tools tab — MCP tool discovery list with server/scope badges
- [x] SSE-driven real-time updates
- [x] Command palette (Cmd+K)
- [ ] Soul editor — edit SOUL.md in-browser
- [ ] Skill manager — upload/assign/remove skills
- [ ] Traefik label for routing (picoarmy.example.com)

### 2.2 Telegram Commander
- [ ] PicoArmy's own Telegram bot (separate from individual picobot bots)
- [ ] `/status`, `/list`, `/spawn`, `/destroy`, `/soul` commands
- [ ] Forward bot crash alerts to your chat

## Phase 3: Automation & Polish

### 3.1 Telemetry Sync
- [ ] Commander periodically reads bot memory/ dirs
- [ ] Export to Postgres telemetry table
- [ ] Retention policy — archive old telemetry

### 3.2 Versioning
- [ ] Soul versioning with rollback support
- [ ] Skill versioning with dependency tracking
- [ ] Audit log for all configuration changes

### 3.3 Alerting
- [ ] Bot crash detection → Telegram notification
- [ ] Ephemeral bot TTL expiry warnings
- [ ] Fleet-wide health summary (daily digest)

## Status

| Phase | Status | Priority |
|-------|--------|----------|
| 1.1 Schema | **Mostly done** — RLS live, needs private schema | P0 |
| 1.2 Dockerfile | Not started | P0 |
| 1.3 Process Manager | **Done** — spawn, health, TTL, PID, tool polling | P0 |
| 1.4 Commander | **Done** — API, SSE, settings, providers | P0 |
| 1.5 MCP Hub | **Done** — 17 tools, scope guard, audit | P0 |
| 1.6 Souls + Skills | Partially done (templates exist) | P1 |
| 1.7 Knowledge Base | Not started | P2 |
| 1.8 Pipelines | Not started | P2 |
| 2.1 Web UI | **Mostly done** — needs soul editor, skill manager | P1 |
| 2.2 Telegram Commander | Not started | P2 |
| 3.x Automation | Backlog | P3 |

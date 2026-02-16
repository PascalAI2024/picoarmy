# PicoArmy — Development Plan

> Fleet Command Center for louisho5/picobot
> Single container: Postgres + PostgREST + Commander + N picobot processes
> Deployed as one Dokploy app on Contabo VPS

## Phase 1: Foundation (Current Sprint)

### 1.1 Schema Hardening
- [ ] Add `private` schema for internal functions/triggers
- [ ] Add `private.bots` table — fleet registry with status, config, ephemeral flag, TTL
- [ ] Add `api.bots` view — computed status (online/idle/offline from last_heartbeat)
- [ ] Add `private.souls` table — versioned SOUL.md storage per bot
- [ ] Add `api.souls` view — latest active soul per bot
- [ ] Add `private.skills` table — modular skill packages
- [ ] Add `api.telemetry` table — JSONB activity logs
- [ ] Add `private.mark_offline()` function — mark stale bots
- [ ] RLS policies on all api tables (bot_id isolation)
- [ ] Roles: `web_anon` (read-only), `bot_role` (own data), `commander` (all)

### 1.2 Dockerfile (Single Container)
- [ ] Multi-stage build: Postgres 15 + PostgREST binary + Node.js + picobot binary
- [ ] Supervisord (or custom entrypoint) to manage processes
- [ ] Volume at `/data/` for all persistent state (DB + bot workspaces)
- [ ] Entrypoint: start Postgres → run init-db → start PostgREST → start commander
- [ ] Commander auto-starts permanent bots from DB registry on boot
- [ ] Health check endpoint for Dokploy

### 1.3 Process Manager (process-manager.ts)
- [ ] Spawn picobot as child process with per-bot env vars and workspace dir
- [ ] Process health monitoring — restart crashed bots
- [ ] Graceful shutdown — SIGTERM propagation to all children
- [ ] TTL tracking — kill ephemeral bots when expired
- [ ] Boot sequence — read DB, start all permanent bots
- [ ] PID tracking + status reporting

### 1.4 Commander Core (commander.ts)
- [ ] PostgREST client wrapper (axios, localhost:3000)
- [ ] `spawn` — Create bot record + write workspace + start process
- [ ] `destroy` — Kill process + archive telemetry + cleanup
- [ ] `list` — All bots with status, PID, uptime, memory usage
- [ ] `deploy-soul` — Write SOUL.md to bot workspace dir (versioned in DB)
- [ ] `deploy-skill` — Write skill to bot workspace dir
- [ ] `status` — Fleet health summary
- [ ] `logs` — Read bot memory/ dir for recent activity
- [ ] `send-command` — Write to bot's HEARTBEAT.md

### 1.5 Soul Templates & Skills Library
- [ ] `souls/assistant.md` — Generic helpful assistant (for mom's bot)
- [ ] `souls/seo-writer.md` — SEO content generator
- [ ] `souls/support-agent.md` — Customer support bot
- [ ] Template system: `commander spawn --soul=assistant --name=mom-helper`
- [ ] Skills library at `/data/skills/` — master repo of deployable skills
- [ ] `commander deploy-skill <skill> --to=<bot|tag>` — push skills to bots
- [ ] `commander list-skills` — show available skills and which bots have them
- [ ] Starter skills: web-research, reminder-system, content-writer

### 1.6 Shared Knowledge Base
- [ ] `/data/shared/` directory structure (clients/, templates/, knowledge/)
- [ ] Commander links relevant knowledge into bot workspaces on spawn
- [ ] `commander share <file> --to=<bot|tag>` — push knowledge to bots
- [ ] Per-client knowledge directories (brand guides, product catalogs, FAQs)

### 1.7 Tool Proxy (Commander as Capabilities Bridge)
- [ ] Bot request format in HEARTBEAT.md (structured commands)
- [ ] Commander watches bot workspaces for proxy requests
- [ ] Fulfill external API calls on behalf of bots
- [ ] Write results back to requesting bot's workspace
- [ ] Secure: bots never see API keys, commander holds all credentials

### 1.8 Inter-Bot Pipelines
- [ ] Pipeline definition format (YAML or JSON)
- [ ] Pipeline runner in commander — chain bot outputs as next bot's input
- [ ] Built-in pipeline: blog-post (research → write → edit → publish)
- [ ] Built-in pipeline: lead-gen (prospect → qualify → outreach)
- [ ] Pipeline status tracking in DB

## Phase 2: Interfaces

### 2.1 Web UI (Fleet Dashboard)
- [ ] Express server embedded in commander process
- [ ] Fleet status grid — all bots with live status, PID, uptime
- [ ] Bot detail view — soul, skills, memory, telemetry
- [ ] Spawn/destroy controls — create permanent or ephemeral bots
- [ ] Soul editor — edit SOUL.md in-browser, write to workspace
- [ ] Skill manager — upload/assign/remove skills
- [ ] Traefik label for routing (picoarmy.example.com)

### 2.2 Telegram Commander
- [ ] Picoarmy's own Telegram bot (separate from individual picobot bots)
- [ ] `/status` — Fleet health summary
- [ ] `/list` — All bots with status
- [ ] `/spawn <soul> [--ttl=1h]` — Spin up a bot
- [ ] `/destroy <name>` — Tear down a bot
- [ ] `/soul <bot> <text>` — Quick soul update
- [ ] Forward bot crash alerts to your chat

## Phase 3: Automation & Polish

### 3.1 Telemetry Sync
- [ ] Commander periodically reads bot memory/ dirs
- [ ] Export to Postgres telemetry table
- [ ] GIN index on JSONB data for queries
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
| 1.1 Schema | **Next** | P0 |
| 1.2 Dockerfile | Parallel with 1.1 | P0 |
| 1.3 Process Manager | Blocked on 1.2 | P0 |
| 1.4 Commander | Blocked on 1.1 + 1.3 | P1 |
| 1.5 Souls + Skills | Blocked on 1.4 | P1 |
| 1.6 Knowledge Base | Blocked on 1.4 | P1 |
| 1.7 Tool Proxy | Blocked on 1.3 | P2 |
| 1.8 Pipelines | Blocked on 1.7 | P2 |
| 2.1 Web UI | Blocked on 1.4 | P2 |
| 2.2 Telegram Commander | Blocked on 1.4 | P2 |
| 3.x Automation | Backlog | P3 |

# PicoArmy — Fleet Command Center

> PostgreSQL-first management layer for [louisho5/picobot](https://github.com/louisho5/picobot) fleets.

## What Is This

PicoArmy Maximus is a fleet management system for **picobot** — a lightweight self-hosted AI chatbot written in Go (~8MB single binary). Picobot supports any OpenAI-compatible API, Telegram integration, modular skills, and personality via `SOUL.md` files.

This project is the **command center** — it manages N picobot instances from a single Docker host, handling:
- **Permanent bots** — always-on instances with fixed roles (support, monitoring, etc.)
- **Ephemeral bots** — spin up N instances on-demand for burst tasks, auto-teardown
- **Dynamic scaling** — start/stop bot containers via CLI, Web UI, or Telegram
- SOUL.md personality management (versioned)
- Skill deployment across the fleet
- Telemetry collection & analysis

### Interfaces
- **TypeScript CLI** (`commander.ts`) — Primary management tool
- **Web UI** — Fleet dashboard, bot management, telemetry viewer
- **Telegram** — Remote fleet control from your phone

## Architecture: Single Container

One Docker container runs everything. Deployed as a Dokploy application on Contabo VPS.
Picobot instances are child processes managed by the commander, not separate containers.

```
One Container: picoarmy
│
│  Processes (managed by supervisord or entrypoint script):
├── postgres         — Database (the brain)
├── postgrest        — Auto-REST API (localhost:3000)
├── commander        — Node.js: web UI + Telegram fleet control + process manager
│
│  Bot Fleet (child processes, spawned/killed by commander):
├── picobot gateway  — mom-helper    (permanent, workspace: /data/bots/mom-helper/)
├── picobot gateway  — seo-acme      (permanent, workspace: /data/bots/seo-acme/)
├── picobot gateway  — task-runner-1  (ephemeral, TTL=2h)
└── ...spawned at runtime, no Docker-in-Docker

Volume: /data/
├── postgres/        — DB files
├── bots/
│   ├── mom-helper/  — config.json, workspace/ (SOUL.md, skills/, memory/)
│   ├── seo-acme/    — config.json, workspace/
│   └── .../
└── picoarmy/        — Commander state, JWT keys
```

**Why single container:**
- Zero orchestration complexity — no sidecars, no Docker socket, no Swarm services
- Commander writes directly to bot workspace dirs — no API needed for config sync
- Picobot reads filesystem on heartbeat tick — changes apply within 60s
- One Dokploy app, one volume, one deploy
- Scales to 50+ bots on ~500MB RAM total

### Key Tables (api schema)
| Table | Purpose |
|-------|---------|
| `api.bots` | Fleet registry — identity, status, heartbeat |
| `api.updates` | Firmware versions with `is_latest` trigger |
| `api.telemetry` | JSONB activity logs from bots |
| `api.latest_firmware` | View — current firmware for bot sync |

### Planned Tables
| Table | Purpose |
|-------|---------|
| `api.souls` | Versioned SOUL.md personalities |
| `api.skills` | Modular skill packages |
| `api.commands` | Task queue for bot commands |
| `api.filesystem` | Virtual filesystem for bot configs |

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Database | PostgreSQL 15 | The brain — all logic lives here |
| Extensions | pg_net, pg_cron, uuid-ossp | Webhooks, scheduling, identity |
| API | PostgREST | Auto-REST from schema, zero code |
| Auth | JWT via PostgREST | Role-based: web_anon, bot_role, commander |
| Control | TypeScript + ts-node | CLI fleet management |
| HTTP | axios | PostgREST client |
| Config | dotenv | Environment management |
| Agent | louisho5/picobot (Go) | The managed fleet units |
| Infra | Docker Compose | Postgres + PostgREST |

## Development

```bash
# Start the hub
docker-compose up -d

# Run TypeScript commands
npx ts-node src/commander.ts

# PostgREST API is at http://localhost:3000
# Postgres is at localhost:5432
```

### Environment Variables (.env)
```
POSTGRES_DB=picoarmy
POSTGRES_USER=commander
POSTGRES_PASSWORD=<secret>
POSTGREST_URL=http://localhost:3000
JWT_SECRET=<32+ char secret for PostgREST>
```

## The Maximizer Layer

PicoArmy is NOT just fleet management. It's a **force multiplier** — the commander
adds capabilities that individual picobots can't have on their own.

### Skills Library (Central → Deployed to Bots)
```
/data/skills/                    # Master skills library
├── web-research/SKILL.md        # Search + summarize
├── seo-keywords/SKILL.md        # Keyword research + density
├── content-writer/SKILL.md      # Blog post generation
├── customer-support/SKILL.md    # FAQ + escalation
├── appointment-booking/SKILL.md # Calendar integration
└── reminder-system/SKILL.md     # Scheduled reminders

Commander deploys skills to bots:
  commander deploy-skill web-research --to=mom-helper
  commander deploy-skill seo-keywords content-writer --to=all-seo-bots
```

### Tool Proxy (Commander as Capabilities Bridge)
Picobot has 11 built-in tools but they're sandboxed to the workspace.
Commander extends bots by fulfilling requests they can't do alone:

- Bot writes request to `HEARTBEAT.md` → Commander reads it
- Commander has API keys, DB access, external integrations
- Commander writes result back to bot's workspace
- Example: "fetch client product catalog" → commander hits client API → writes JSON to bot's workspace

### Inter-Bot Pipelines
Commander chains bots for multi-stage workflows:
```
Pipeline: "blog-post"
  1. researcher-bot  → research topic, save findings
  2. writer-bot      → read findings, write draft
  3. editor-bot      → polish draft, check SEO
  4. commander       → publish to WordPress via API

Pipeline: "lead-gen"
  1. prospector-bot  → find leads from web
  2. qualifier-bot   → score and filter
  3. outreach-bot    → draft personalized emails
  4. commander       → send via email API
```

### Shared Knowledge Base
```
/data/shared/                    # Shared across all bots
├── clients/
│   ├── acme/brand-guide.md      # Brand voice, colors, messaging
│   ├── acme/products.json       # Product catalog
│   └── bakery/faq.md            # Customer FAQ
├── templates/
│   ├── blog-post-structure.md   # Content templates
│   └── email-outreach.md        # Email templates
└── knowledge/
    ├── seo-best-practices.md    # Shared expertise
    └── industry-terms.md        # Domain knowledge

Commander symlinks or copies relevant knowledge into bot workspaces.
```

### Soul Evolution
- Track which soul versions produce best results (via telemetry)
- A/B test soul variations across bot instances
- Auto-promote winning souls, rollback losers
- Soul templates + per-bot customization layers

## Conventions

- **SQL-first**: Business logic in Postgres functions/triggers, not TypeScript
- **Views over tables**: PostgREST exposes views, not raw tables
- **JSONB for flexibility**: Telemetry, metadata, and configs use JSONB
- **Versioned everything**: Souls, skills, and firmware are version-tracked
- **Direct filesystem control**: Commander writes to bot dirs, no APIs between them
- **Pipelines over monoliths**: Chain small specialized bots, not one mega-bot

## LLM Provider Strategy

Two access modes per provider: **Regular API** (pay-per-token) and **Coding Plan** (prompt-quota subscription).
Both are usable via API endpoints — coding plans are NOT IDE-only.

### Provider Tiers

| Tier | Provider / Model | Cost | Use For |
|------|-----------------|------|---------|
| **Free** | Zhipu GLM-4.7-Flash | $0 (unlimited) | Heartbeats, idle chat, low-stakes |
| **Coding Plan** | GLM-4.7 via z.ai | ~$3-15/mo flat | Standard bots (prompt quota) |
| **Coding Plan** | MiniMax M2.1 via /anthropic | ~$10-50/mo flat | Active bots (prompt quota) |
| **Pay-per-token** | MiniMax M2 | $0.255/$1.00 per 1M | Overflow / burst |
| **Pay-per-token** | MiniMax M2.5 | $0.30/$1.20 per 1M | Premium interactions |
| **Pay-per-token** | Claude Haiku 3.5 | $0.80/$4.00 per 1M | Tool use, complex tasks |

### API Endpoints

| Provider | Type | Base URL | Format |
|----------|------|----------|--------|
| MiniMax Regular | Pay-per-token | `https://api.minimax.io/v1` | OpenAI-compatible |
| MiniMax Coding Plan | Prompt-quota | `https://api.minimax.io/anthropic` | Anthropic-compatible |
| Zhipu Regular | Pay-per-token | `https://open.bigmodel.cn/api/paas/v4` | OpenAI-compatible |
| Zhipu Coding Plan | Prompt-quota | `https://api.z.ai/api/coding/paas/v4` | OpenAI-compatible |
| OpenRouter | Gateway | `https://openrouter.ai/api/v1` | OpenAI-compatible |

**Note:** MiniMax coding plan uses Anthropic format — picobot needs adapter for that endpoint.
GLM coding plan uses OpenAI format — works directly with picobot.

### Coding Plan Quotas

| Provider | Tier | Price | Prompts/5hr | ~Model Calls | Models |
|----------|------|-------|-------------|--------------|--------|
| MiniMax | Starter | $10/mo | 100 | ~1,500 | M2.5, M2.1 |
| MiniMax | Plus | $20/mo | 300 | ~4,500 | M2.5, M2.1 |
| MiniMax | Max | $50/mo | 1,000 | ~15,000 | M2.5, M2.1 |
| GLM | Lite | $3/mo | ~120 | ~1,800 | GLM-4.7 |
| GLM | Pro | $15/mo | ~600 | ~9,000 | GLM-4.7 + GLM-5 |

1 prompt = ~15 model API calls. Quota resets every 5 hours (rolling window).
GLM-4.7-Flash and GLM-4.5-Flash are **always free** with no quota limits.

### Rate Limits

| Provider | Free Tier | Paid Tier | Notes |
|----------|-----------|-----------|-------|
| Zhipu GLM-Flash | ~10 concurrent/key | Higher | Free, no daily quota |
| MiniMax | 100 RPM / 1K req/day | 500 RPM / 100K+ req/day | 20M TPM paid |
| Anthropic Tier 4 | — | 4,000 RPM | $400 deposit, cached tokens free |
| OpenRouter | 20 RPM free | 500 RPS paid | BYOK: 1M free req/month |

### Fleet Strategy

**Primary (flat-cost):** Route most bots through coding plan endpoints
- GLM coding plan (`api.z.ai`) for OpenAI-compatible bots → works with picobot directly
- MiniMax coding plan (`/anthropic`) for Anthropic-format bots → needs adapter

**Fallback (free):** GLM-4.7-Flash for heartbeats and idle bots — zero cost
**Overflow (pay-per-token):** MiniMax M2 regular API when coding plan quota exhausted
**Fallback chain:** GLM Coding Plan → GLM-Flash (free) → MiniMax M2 (pay-per-token)

## File Structure

```
picoarmy/
├── .claude/
│   ├── CLAUDE.md          # This file
│   └── PLAN.md            # Development roadmap
├── .env                   # Environment config (not committed)
├── .env.example           # Template with all env vars
├── docker-compose.yml     # Dev: Postgres + PostgREST
├── init-db/
│   └── 01-schema.sql      # Base schema + seed data
├── src/
│   ├── commander.ts       # Express server + API + SSE + static dashboard
│   ├── process-manager.ts # Spawn/kill/monitor picobot child processes
│   ├── api-client.ts      # PostgREST client (axios + mock fallback)
│   └── dashboard/         # Vite React app (command center UI)
│       ├── src/
│       │   ├── components/ # UI primitives, fleet views, command palette
│       │   ├── stores/     # Zustand state (fleet, telemetry)
│       │   ├── hooks/      # useSSE, useFleet
│       │   └── lib/        # API client, types, mock data
│       └── package.json
├── souls/                 # Soul templates (deployed to bots on spawn)
│   ├── assistant.md       # Personal assistant
│   ├── seo-writer.md      # SEO content generator
│   └── support-agent.md   # Customer support bot
├── package.json
└── tsconfig.json

Runtime data (/data/ — not committed):
├── bots/
│   ├── mom-helper/        # Per-bot workspace
│   │   ├── config.json    # Picobot config (LLM, Telegram)
│   │   └── workspace/     # SOUL.md, skills/, memory/
│   └── seo-acme/
└── ...
```

## PostgREST Patterns

- **Schema isolation**: `api` schema for public endpoints, `internal` for private logic
- **JWT auth**: Bots authenticate with JWT containing `bot_id` claim
- **RLS policies**: `bot_id = current_setting('request.jwt.claims')::json->>'bot_id'`
- **pg_net triggers**: On soul/skill update → webhook to affected bots
- **pg_cron health**: Every 60s mark bots as `offline` if no heartbeat in 5min

## Picobot Deep Dive (v0.1.3-preview)

Go single binary (~8MB), Alpine Docker image (~28MB). Zero external deps beyond `spf13/cobra`.

### Architecture
```
[Telegram] ──→ [Chat Hub (In/Out channels)] ──→ [Agent Loop] ──→ [OpenAI API]
                       ↑                              │
                 [Heartbeat]                    [11 Built-in Tools]
                 [Cron Scheduler]               [Session Manager]
                                                [Memory Store]
                                                [Context Builder]
```

### Workspace Layout (~/.picobot/)
| File | Purpose | Edited By |
|------|---------|-----------|
| `config.json` | LLM provider, model, Telegram token, heartbeat interval | Human |
| `workspace/SOUL.md` | Agent personality, values, style | Human |
| `workspace/AGENTS.md` | Agent instructions and rules | Human |
| `workspace/USER.md` | User profile and preferences | Human |
| `workspace/TOOLS.md` | Tool documentation | Human |
| `workspace/HEARTBEAT.md` | Periodic tasks (natural language cron) | Human / Agent |
| `workspace/memory/MEMORY.md` | Long-term memory | Agent |
| `workspace/memory/YYYY-MM-DD.md` | Daily notes | Agent |
| `workspace/skills/<name>/SKILL.md` | Modular skill packages | Agent / Human |

### Critical Constraint: No HTTP API

Picobot exposes **zero REST endpoints**. It has no webhook support, no registration API, no health endpoint. Communication is:
- **Inbound**: Telegram long-polling only
- **Outbound**: OpenAI-compatible API calls to LLM
- **Internal**: Go channels between components

### Fleet Control Plane (Direct Process Management)

Since everything is in one container, NO sidecars or Docker API needed:

1. **Direct filesystem writes** — Commander writes `SOUL.md`, `config.json`, skills to `/data/bots/{name}/`
2. **Child process spawning** — `child_process.spawn('picobot', ['gateway'])` with per-bot env/cwd
3. **Process health monitoring** — Commander watches PIDs, restarts crashed bots
4. **Heartbeat.md as command channel** — Write instructions, bot processes on next tick (60s)
5. **Memory reading** — Commander reads `/data/bots/{name}/workspace/memory/` for telemetry export

### Bot Lifecycle
```
SPAWN:  commander spawn --soul=researcher --name=task-42 --ephemeral --ttl=1h
        → DB record created
        → Write config.json + SOUL.md to /data/bots/task-42/
        → child_process.spawn('picobot', ['gateway'], { cwd, env })
        → Bot live on Telegram within seconds

RUNTIME:
        Commander process manager loop:
        - Watch all child PIDs, restart on crash
        - Sync DB changes → write to bot workspace dirs
        - Read bot memory/ dirs → export telemetry to Postgres
        - TTL timer kills ephemeral bots when expired

DESTROY: TTL expires OR commander destroy task-42 OR Telegram /destroy
         → SIGTERM to process → archive telemetry → cleanup workspace dir
```

### Scaling Model
- **Permanent bots**: Auto-started on container boot from DB registry, restart on crash
- **Ephemeral bots**: Spawned at runtime by commander, auto-killed after TTL
- **Burst**: `commander scale seo-writer --count=5 --ttl=2h`
- ~10MB RAM per bot process — 50+ bots on ~500MB total
- All processes share one filesystem, one Postgres, one container

### Production: Dokploy Application
Single Dokploy app on Contabo VPS (147.93.146.152).
- One Docker image, one container, one volume (`/data/`)
- Traefik routes web UI (e.g. `picoarmy.example.com`)
- Deploy: push to GitHub → Dokploy webhook → rebuild + restart
- Permanent bots auto-start on container boot from DB registry
- Logs: `ssh igd-ro 'docker logs picoarmy --tail 50'`

### Environment Variable Overrides (Docker)
```
OPENAI_API_KEY, OPENAI_API_BASE, PICOBOT_MODEL
TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOW_FROM
```

### 11 Built-in Tools
`filesystem`, `exec`, `web`, `message`, `spawn` (stub), `cron`,
`write_memory`, `create_skill`, `list_skills`, `read_skill`, `delete_skill`

# PicoArmy — Fleet Command Center

> PostgreSQL-first management layer for [louisho5/picobot](https://github.com/louisho5/picobot) fleets.

## What Is This

PicoArmy is a fleet management system for **picobot** — a lightweight self-hosted AI chatbot written in Go (~8MB single binary). Picobot supports any OpenAI-compatible API, Telegram integration, modular skills, and personality via `SOUL.md` files.

This project is the **command center** — it manages N picobot instances from a single Docker host:
- **Permanent bots** — always-on instances with fixed roles (support, monitoring, etc.)
- **Ephemeral bots** — spin up N instances on-demand for burst tasks, auto-teardown
- **Dynamic scaling** — start/stop bots via Web UI or Telegram
- SOUL.md personality management (versioned)
- Skill deployment across the fleet
- Real-time telemetry via SSE

## Architecture: Single Container

One Docker container runs everything. Picobot instances are child processes, not separate containers.

```
One Container: picoarmy
│
│  Services:
├── postgres         — Database (the brain)                     :5432
├── postgrest        — Auto-REST API from schema                :3000
├── commander        — Express: dashboard + API + process mgr   :4000
│
│  Bot Fleet (child processes spawned by commander):
├── picobot gateway  — mom-helper    (permanent)
├── picobot gateway  — seo-acme      (permanent)
├── picobot gateway  — task-runner-1  (ephemeral, TTL=2h)
└── ...spawned at runtime, no Docker-in-Docker

Volume: /data/
├── postgres/        — DB files
├── bots/{name}/     — config.json, workspace/ (SOUL.md, skills/, memory/)
└── pids/            — PID files for zombie reaping
```

**Why single container:** Zero orchestration complexity. Commander writes directly to bot workspace dirs. Picobot reads filesystem on heartbeat tick — changes apply within 60s. Scales to 50+ bots on ~500MB RAM.

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Database | PostgreSQL 15 | pg_net, pg_cron, uuid-ossp extensions |
| API Gateway | PostgREST | Auto-REST from `api` schema, RLS enforcement |
| Auth | JWT + RLS | `api.get_client_id()` extracts `x-client-id` header |
| Commander | TypeScript + Express | Fleet API + dashboard + SSE + process manager |
| MCP | @modelcontextprotocol/sdk | Tool proxy hub (Z.AI + MiniMax servers) |
| Dashboard | React 19 + Vite 7 | Zustand, React Router 7, Radix UI, Recharts, Sonner |
| Agent | louisho5/picobot (Go) | The managed fleet units (~8MB binary) |
| Infra | Docker Compose | Postgres + PostgREST (dev) |

## Development

```bash
# Start infrastructure
docker-compose up -d          # Postgres :5432, PostgREST :3000

# Build dashboard
cd src/dashboard && npm run build && cd ../..

# Start commander (serves dashboard + API on same origin)
npx ts-node src/commander.ts  # http://localhost:4000

# Dashboard served at :4000 (same origin as API — no CORS needed)
# API at :4000/api/*
# SSE at :4000/api/sse
```

**Important:** Dashboard is served as static files from Commander at `:4000`. No separate Vite dev server needed. After editing dashboard code: `cd src/dashboard && npm run build` then restart Commander.

### Environment Variables (.env)
```
POSTGRES_DB=picoarmy
POSTGRES_USER=commander
POSTGRES_PASSWORD=<secret>
POSTGREST_URL=http://localhost:3000
JWT_SECRET=<32+ char secret for PostgREST>
```

## Commander API (src/commander.ts)

Express server at `:4000`. Serves dashboard static files AND the REST/SSE API.

### Routes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/fleet` | All bots (DB + live process info merged) |
| GET | `/api/fleet/:id` | Single bot detail |
| POST | `/api/fleet` | Spawn a new bot |
| DELETE | `/api/fleet/:id` | Destroy a bot (kills process + DB delete) |
| PATCH | `/api/fleet/:id/settings` | Update bot settings (provider, model, soul) |
| GET | `/api/fleet/:id/logs` | Bot telemetry entries |
| GET | `/api/fleet/:id/soul` | Bot's current SOUL.md content |
| POST | `/api/fleet/:id/soul` | Deploy a soul template to bot |
| GET | `/api/fleet/process/status` | Live process manager status |
| GET | `/api/souls` | List soul templates (from `/souls/*.md`) |
| GET | `/api/providers` | Available LLM provider presets |
| GET | `/api/tools` | MCP tools (filtered by `?bot=name` scope) |
| GET | `/api/tools/:name` | Tool detail |
| POST | `/api/tools/:name/call` | Execute MCP tool (body: `{arguments, bot_name}`) |
| GET | `/api/mcp/status` | MCP hub connection status per server |
| GET | `/api/sse` | SSE stream (fleet + log + MCP events) |
| GET | `*` | Dashboard static files (SPA fallback) |

### SSE Events

| Event | Payload | Source |
|-------|---------|--------|
| `connected` | `{clientId}` | On SSE connect |
| `fleet:update` | `Bot[]` | 30s interval broadcast |
| `fleet:spawn` | `Bot` | Bot spawned |
| `fleet:destroy` | `{id}` | Bot destroyed |
| `fleet:crash` | `{id, name, reason}` | Bot process crashed |
| `log:entry` | `LogEntry` | Process stdout/stderr |
| `mcp:tool-called` | `{tool, bot, args}` | MCP tool executed |
| `mcp:tool-error` | `{tool, error}` | MCP tool failed |
| `mcp:tool-denied` | `{tool, bot, reason}` | Scope violation |
| `mcp:server-connected` | `{server}` | MCP server online |
| `mcp:server-error` | `{server, error}` | MCP server failed |

### Key Backend Files

| File | Purpose |
|------|---------|
| `src/commander.ts` | Express server, all API routes, SSE, static dashboard |
| `src/process-manager.ts` | Spawn/kill/monitor picobot child processes, PID persistence |
| `src/mcp-hub.ts` | MCP client hub — connect servers, discover tools, scope guard, proxy calls |
| `src/api-client.ts` | PostgREST HTTP client (axios) |

## Dashboard (src/dashboard/)

React 19 SPA built with Vite 7. Served from Commander at `:4000` (same origin).

### Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `FleetPage` | Fleet overview — bot cards grid with health bar |
| `/fleet/:id` | `BotDetailPage` | Bot detail — tabs: Overview, Soul, Telemetry, Skills, Settings, Tools |
| `/souls` | `SoulsPage` | Soul template management (placeholder) |
| `/skills` | `SkillsPage` | Skills library (placeholder) |
| `/logs` | `LogsPage` | Global log viewer (placeholder) |

### State Management

| Store | File | State |
|-------|------|-------|
| `useFleetStore` | `stores/fleet.ts` | `bots[]`, `filter`, `loading`, `error` + selectors |
| `useTelemetryStore` | `stores/telemetry.ts` | `logs[]`, `activities[]` |
| `useMCPStore` | `stores/mcp.ts` | MCP events feed |

### Hooks

| Hook | Purpose |
|------|---------|
| `useFleet` | Fleet CRUD operations (fetch, create, destroy) |
| `useSSE` | SSE connection with auto-reconnect + exponential backoff |
| `useCommandBar` | Command palette state (Cmd+K) |

### Component Map

```
src/dashboard/src/
├── App.tsx                         # Router, ErrorBoundary, CommandBar, Toaster
├── main.tsx                        # BrowserRouter mount
├── components/
│   ├── command/
│   │   └── CommandBar.tsx          # Cmd+K command palette
│   ├── fleet/
│   │   ├── FleetGrid.tsx           # Bot cards grid with entrance animations
│   │   ├── BotCard.tsx             # Individual bot card (status, uptime, memory)
│   │   ├── BotDetail.tsx           # Tabbed bot detail view (6 tabs)
│   │   ├── FleetStats.tsx          # Fleet statistics summary
│   │   ├── FleetHealthBar.tsx      # Online/idle/offline ratio bar
│   │   ├── MCPStatus.tsx           # MCP server connection status panel
│   │   └── SpawnDialog.tsx         # Bot spawn form (name, soul, provider, TTL)
│   ├── layout/
│   │   ├── Shell.tsx               # Layout shell (sidebar + topbar + content)
│   │   ├── Sidebar.tsx             # Nav sidebar (responsive, mobile hamburger)
│   │   └── TopBar.tsx              # Header (fleet stats, SSE indicator, Cmd+K)
│   ├── telemetry/
│   │   ├── LogStream.tsx           # Real-time log viewer
│   │   └── ActivityChart.tsx       # Recharts activity visualization
│   └── ui/
│       ├── StatusLED.tsx           # Animated status indicator with glow
│       ├── ConfirmDialog.tsx       # Styled destructive action confirmation
│       ├── ErrorBoundary.tsx       # React error boundary with recovery
│       ├── Dialog.tsx              # Radix Dialog wrapper
│       ├── Tabs.tsx                # Radix Tabs wrapper
│       ├── Select.tsx              # Radix Select wrapper
│       └── DropdownMenu.tsx        # Radix DropdownMenu wrapper
├── hooks/
│   ├── useFleet.ts
│   ├── useSSE.ts
│   └── useCommandBar.ts
├── stores/
│   ├── fleet.ts                    # Zustand fleet store
│   ├── telemetry.ts                # Zustand telemetry store
│   └── mcp.ts                      # Zustand MCP events store
├── lib/
│   ├── api.ts                      # REST API client (12 functions)
│   ├── types.ts                    # Shared TypeScript types
│   └── format.ts                   # Formatting utilities
└── theme/
    └── tokens.css                  # CSS variables, animations, panel styles
```

### Design System

- **Theme:** Dark terminal aesthetic — charcoal backgrounds, cyan accents, mono fonts
- **Animations:** Fade-slide-in entrance, pulse glow on status LEDs, hover lift on cards
- **Layout:** Fixed sidebar (collapsible on mobile) + top bar + scrollable content
- **Toast:** Sonner library, dark theme, bottom-right position
- **Icons:** Lucide React throughout
- **Responsive:** Mobile hamburger menu, sidebar overlay on small screens

### Key Patterns

**Zustand selector trap:** Never call `state.fn()` inside a Zustand selector — returns new object refs every render → infinite re-render loop. Select primitives (`state.bots`) and compute outside the selector.

```typescript
// BAD — infinite loop
const stats = useFleetStore((s) => s.stats());

// GOOD — select primitives, compute inline
const bots = useFleetStore((s) => s.bots);
const stats = { online: bots.filter(b => b.status === 'online').length, ... };
```

**Same-origin serving:** Dashboard built to `src/dashboard/dist/`, served by Commander's `express.static()`. API at `/api/*` on same origin = no CORS issues. The CORS middleware exists for Vite dev server mode but is unnecessary in production.

**SSE auto-reconnect:** `useSSE` hook connects to `/api/sse`, handles all event types, and auto-reconnects with exponential backoff (1s → 30s max).

## Database (PostgreSQL)

### Key Tables (api schema)

| Table | Purpose |
|-------|---------|
| `api.bots` | Fleet registry — identity, status, heartbeat, client_id |
| `api.updates` | Firmware versions with `is_latest` trigger |
| `api.telemetry` | JSONB activity logs from bots |
| `api.mcp_tool_calls` | MCP tool call audit log (bot, tool, args, result, duration) |
| `api.latest_firmware` | View — current firmware for bot sync |
| `api.get_client_id()` | Helper — extracts x-client-id from PostgREST request headers |

### RLS (Row Level Security)

Enabled on `bots`, `telemetry`, `mcp_tool_calls`. Policies use PostgREST 14's `request.headers` JSON GUC via `api.get_client_id()`:
- **No x-client-id header** → Commander mode, sees all rows
- **x-client-id: acme** → Client mode, sees only rows where `client_id = 'acme'`
- DB owner (`commander` role) bypasses RLS automatically

### Planned Tables

| Table | Purpose |
|-------|---------|
| `api.souls` | Versioned SOUL.md personalities |
| `api.skills` | Modular skill packages |

## MCP Client Hub (src/mcp-hub.ts)

Commander acts as the universal MCP client for the fleet. Bots don't connect to MCP servers directly — Commander proxies tool calls with scope enforcement.

**Connected servers** (configured in `mcp-servers.json`):

| Server | Transport | Tools | Scope |
|--------|-----------|-------|-------|
| Z.AI | stdio (npx) | 8 vision/web/GitHub tools | shared |
| MiniMax | stdio (uvx) | 9 TTS/video/image/music tools | shared |

**Scope guard:** Tools scoped `"shared"` are available to all bots. Tools scoped `"client:<id>"` are restricted to bots with matching `client_id`.

## Fleet Control Plane

Since everything is in one container, NO sidecars or Docker API needed:

1. **Direct filesystem writes** — Commander writes `SOUL.md`, `config.json`, skills to `/data/bots/{name}/`
2. **Child process spawning** — `child_process.spawn('picobot', ['gateway'])` with per-bot env/cwd
3. **Process health monitoring** — Commander watches PIDs, restarts crashed bots
4. **Separate IPC channels** (prevents write-write race condition):
   - `HEARTBEAT.md` — Bot-owned. Bots write `TOOL_REQUEST` blocks, Commander reads and clears.
   - `COMMANDS.md` — Commander-owned. Commander appends commands, bots read and clear.
5. **PID persistence** — PIDs at `data/pids/{name}.pid`. On startup, `reapOrphans()` kills orphaned processes.
6. **Memory reading** — Commander reads `/data/bots/{name}/workspace/memory/` for telemetry export

### Bot Lifecycle

```
SPAWN:   POST /api/fleet {name, soul_name, provider, ...}
         → DB record created → Write config.json + SOUL.md → child_process.spawn
         → Bot live on Telegram within seconds

RUNTIME: Commander process manager loop:
         - Watch PIDs, restart on crash
         - Sync DB changes → write to workspace dirs
         - Read memory/ → export telemetry to Postgres
         - TTL timer kills ephemeral bots when expired

DESTROY: DELETE /api/fleet/:id OR TTL expires
         → SIGTERM to process → archive telemetry → cleanup workspace
```

## Picobot (v0.1.3-preview)

Go single binary (~8MB), Alpine Docker image (~28MB). Zero external deps beyond `spf13/cobra`.

```
[Telegram] ──→ [Chat Hub] ──→ [Agent Loop] ──→ [OpenAI API]
                    ↑                │
              [Heartbeat]      [11 Built-in Tools]
              [Cron Scheduler] [Session/Memory/Context]
```

### Critical Constraint: No HTTP API

Picobot exposes zero REST endpoints. Communication:
- **Inbound**: Telegram long-polling only
- **Outbound**: OpenAI-compatible API calls
- **Internal**: Go channels

### Workspace Layout (~/.picobot/)

| File | Purpose | Edited By |
|------|---------|-----------|
| `config.json` | LLM provider, model, Telegram token, heartbeat interval | Commander |
| `workspace/SOUL.md` | Agent personality, values, style | Commander / Human |
| `workspace/AGENTS.md` | Agent instructions and rules | Human |
| `workspace/HEARTBEAT.md` | Periodic tasks + TOOL_REQUEST blocks | Agent / Commander |
| `workspace/COMMANDS.md` | Commander → bot commands | Commander |
| `workspace/memory/MEMORY.md` | Long-term memory | Agent |
| `workspace/skills/<name>/SKILL.md` | Modular skill packages | Agent / Human |

### 11 Built-in Tools

`filesystem`, `exec`, `web`, `message`, `spawn` (stub), `cron`, `write_memory`, `create_skill`, `list_skills`, `read_skill`, `delete_skill`

## LLM Provider Strategy

Two access modes per provider: **Regular API** (pay-per-token) and **Coding Plan** (prompt-quota subscription). Both usable via API endpoints.

### Provider Tiers

| Tier | Provider / Model | Cost | Use For |
|------|-----------------|------|---------|
| **Free** | Zhipu GLM-4.7-Flash | $0 (unlimited) | Heartbeats, idle chat |
| **Coding Plan** | GLM-4.7 via z.ai | ~$3-15/mo | Standard bots |
| **Coding Plan** | MiniMax M2.1 via /anthropic | ~$10-50/mo | Active bots |
| **Pay-per-token** | MiniMax M2/M2.5 | $0.255-0.30/1M in | Overflow/burst |
| **Pay-per-token** | Claude Haiku 3.5 | $0.80/$4.00/1M | Tool use, complex |

### API Endpoints

| Provider | Base URL | Format |
|----------|----------|--------|
| MiniMax Regular | `https://api.minimax.io/v1` | OpenAI |
| MiniMax Coding Plan | `https://api.minimax.io/anthropic` | Anthropic |
| Zhipu Regular | `https://open.bigmodel.cn/api/paas/v4` | OpenAI |
| Zhipu Coding Plan | `https://api.z.ai/api/coding/paas/v4` | OpenAI |
| OpenRouter | `https://openrouter.ai/api/v1` | OpenAI |

**Fallback chain:** GLM Coding Plan → GLM-Flash (free) → MiniMax M2 (pay-per-token)

## Conventions

- **SQL-first**: Business logic in Postgres functions/triggers, not TypeScript
- **Same-origin serving**: Dashboard built to `dist/`, served by Commander — no CORS in production
- **JSONB for flexibility**: Telemetry, metadata, and configs use JSONB
- **Separate IPC channels**: HEARTBEAT.md (bot→commander) + COMMANDS.md (commander→bot)
- **Pipelines over monoliths**: Chain small specialized bots, not one mega-bot
- **Zustand primitives**: Select atomic values from store, compute derived state outside selectors
- **Sonner for toasts**: No `alert()` or `confirm()` — use toast notifications and ConfirmDialog

## File Structure

```
picoarmy/
├── .claude/
│   ├── CLAUDE.md               # This file
│   └── PLAN.md                 # Development roadmap
├── .env                        # Environment config (not committed)
├── docker-compose.yml          # Dev: Postgres + PostgREST
├── mcp-servers.json            # MCP server config (servers, env vars, scopes)
├── init-db/
│   ├── 01-schema.sql           # Base schema + seed data
│   ├── 02-mcp-schema.sql       # client_id column + mcp_tool_calls table
│   └── 03-rls.sql              # Row Level Security policies
├── src/
│   ├── commander.ts            # Express server + API + SSE + static dashboard
│   ├── process-manager.ts      # Spawn/kill/monitor picobot child processes
│   ├── mcp-hub.ts              # MCP client hub — connect, discover, scope, proxy
│   ├── api-client.ts           # PostgREST client (axios)
│   └── dashboard/              # Vite React 19 app
│       ├── src/
│       │   ├── App.tsx         # Router, ErrorBoundary, CommandBar, Toaster
│       │   ├── components/     # command/, fleet/, layout/, telemetry/, ui/
│       │   ├── stores/         # Zustand: fleet, telemetry, mcp
│       │   ├── hooks/          # useSSE, useFleet, useCommandBar
│       │   ├── lib/            # api.ts, types.ts, format.ts
│       │   └── theme/          # tokens.css (design tokens, animations)
│       └── package.json
├── souls/                      # Soul templates (deployed to bots on spawn)
│   ├── assistant.md
│   ├── seo-writer.md
│   └── support-agent.md
├── package.json
└── tsconfig.json
```

## Production: Dokploy Application

Single Dokploy app on Contabo VPS.
- One Docker image, one container, one volume (`/data/`)
- Traefik routes web UI
- Deploy: push to GitHub → Dokploy webhook → rebuild + restart
- Permanent bots auto-start on container boot from DB registry

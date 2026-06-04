# Contributing to PicoArmy

Thanks for your interest in contributing! This guide covers how to get set up and the conventions the project follows.

## Development Setup

**Prerequisites:** Docker + Docker Compose, Node.js 20+, and (to run actual bots) the [picobot](https://github.com/louisho5/picobot) binary on your `PATH`.

```bash
# Clone and install
git clone https://github.com/PascalAI2024/picoarmy.git
cd picoarmy
npm install

# Configure environment
cp .env.example .env          # fill in POSTGRES_PASSWORD, JWT_SECRET, provider keys

# Start infrastructure
docker compose up -d          # Postgres :5432, PostgREST :3000

# Build the dashboard, then run the Commander
npm run build:dashboard
npm run dev                   # http://localhost:4000
```

## Project Layout

| Path | What lives here |
|------|-----------------|
| `src/commander.ts` | Express server — API routes, SSE, static dashboard serving |
| `src/process-manager.ts` | Spawns/monitors picobot child processes |
| `src/mcp-hub.ts` | MCP client hub — tool discovery, scope guard, audit logging |
| `src/api-client.ts` | PostgREST HTTP client |
| `src/dashboard/` | React 19 + Vite dashboard (separate sub-project) |
| `init-db/` | SQL schema, migrations, and RLS policies |
| `souls/`, `swarms/`, `skills/` | Templates for personalities, swarms, and skills |

See [`.claude/CLAUDE.md`](.claude/CLAUDE.md) for the full architecture reference.

## Before You Submit

Run the checks locally — CI runs the same:

```bash
npm run typecheck             # backend type check (must be clean)
npm run build:dashboard       # dashboard must build
```

## Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
- **SQL-first:** Prefer Postgres functions, triggers, and RLS over TypeScript for data-layer logic.
- **Zustand selectors:** Select primitives and compute derived state outside the selector (see CLAUDE.md — calling `state.fn()` in a selector causes infinite re-renders).
- **Toasts, not dialogs:** Use Sonner toasts and `ConfirmDialog`, never `alert()` / `confirm()`.
- **No secrets in commits:** Real keys belong in `.env` (gitignored), never in tracked files.

## Pull Requests

1. Open an issue first for substantial changes so we can align on approach.
2. Branch from `main`, keep PRs focused and reasonably small.
3. Ensure `typecheck` and the dashboard build pass.
4. Describe what changed and why in the PR body.

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).

# State Management & Data Layer

This directory contains the Zustand stores, hooks, and API client for the PicoArmy dashboard.

## Architecture

```
lib/
├── api.ts         — REST API client wrapper (fetch-based)
└── types.ts       — Shared TypeScript types

stores/
├── fleet.ts       — Fleet state (bots, selection, filtering)
└── telemetry.ts   — Telemetry/log state

hooks/
├── useSSE.ts      — Server-Sent Events connection with auto-reconnect
└── useFleet.ts    — Fleet actions (spawn, destroy, deploy soul)
```

## Usage Examples

### 1. Display Fleet List

```tsx
import { useFleetStore } from '@/stores';

function FleetGrid() {
  const { filteredBots, stats } = useFleetStore();
  const bots = filteredBots();
  const { online, idle, offline } = stats();

  return (
    <div>
      <div>Online: {online} | Idle: {idle} | Offline: {offline}</div>
      {bots.map(bot => (
        <BotCard key={bot.id} bot={bot} />
      ))}
    </div>
  );
}
```

### 2. Connect to SSE Stream

```tsx
import { useSSE } from '@/hooks';
import { useFleetStore } from '@/stores';

function App() {
  const { connected, error } = useSSE({ enabled: true });

  return (
    <div>
      {connected ? '🟢 Connected' : '🔴 Disconnected'}
      {error && <div>Error: {error}</div>}
      {/* Your app content */}
    </div>
  );
}
```

### 3. Spawn a Bot

```tsx
import { useFleet } from '@/hooks';

function SpawnDialog() {
  const { spawnBot, loading, error } = useFleet();

  const handleSpawn = async () => {
    try {
      await spawnBot({
        name: 'new-bot',
        soul_name: 'assistant',
        is_permanent: true,
      });
      alert('Bot spawned!');
    } catch (err) {
      alert('Failed to spawn bot');
    }
  };

  return (
    <button onClick={handleSpawn} disabled={loading}>
      {loading ? 'Spawning...' : 'Spawn Bot'}
    </button>
  );
}
```

### 4. Filter Bots by Status

```tsx
import { useFleetStore } from '@/stores';

function FilterButtons() {
  const { filter, setFilter } = useFleetStore();

  return (
    <div>
      <button onClick={() => setFilter('all')}>All</button>
      <button onClick={() => setFilter('online')}>Online</button>
      <button onClick={() => setFilter('idle')}>Idle</button>
      <button onClick={() => setFilter('offline')}>Offline</button>
    </div>
  );
}
```

### 5. View Logs

```tsx
import { useTelemetryStore } from '@/stores';

function LogStream() {
  const { recentLogs } = useTelemetryStore();
  const logs = recentLogs(50); // Last 50 logs

  return (
    <div>
      {logs.map(log => (
        <div key={log.id} className={log.level}>
          [{log.timestamp}] {log.message}
        </div>
      ))}
    </div>
  );
}
```

## Data Flow

```
Commander API (Express)
    ↓ SSE Stream
useSSE hook
    ↓ Events (fleet:update, fleet:spawn, log:entry)
Zustand Stores (fleet, telemetry)
    ↓ State updates
React Components
```

## API Endpoints

All API calls go through `/api/*` endpoints served by the Commander Express server:

- `GET /api/fleet` — List all bots
- `GET /api/fleet/:id` — Single bot detail
- `POST /api/fleet` — Create bot
- `DELETE /api/fleet/:id` — Destroy bot
- `GET /api/fleet/:id/logs` — Bot telemetry
- `GET /api/souls` — Available soul templates
- `POST /api/fleet/:id/soul` — Deploy soul
- `GET /api/sse` — SSE stream (real-time updates)

## Environment Variables

```env
# Vite React app
VITE_API_URL=http://localhost:4000  # Commander API base URL (optional, defaults to same origin)
```

## Type Safety

All API responses and store state are fully typed with TypeScript. The `types.ts` file contains shared interfaces that match the backend Bot/LogEntry types from the Commander server.

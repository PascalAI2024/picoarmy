# Telemetry Components

Real-time log viewing and activity visualization.

## LogStream

Auto-scrolling monospace log viewer with filtering.

### Usage

```tsx
import { LogStream } from '@/components/telemetry';

function LogsPanel() {
  return <LogStream maxLines={500} height="600px" />;
}
```

### Props

- `maxLines?: number` — Max logs to display (default: 500)
- `height?: string` — Container height (default: "400px")

### Features

- **Auto-scroll**: Scrolls to bottom on new logs
- **Manual scroll pause**: Scroll up to pause auto-scroll
- **Jump to latest**: Button appears when not at bottom
- **Filter**: Real-time search across bot names and messages
- **Level colors**: info=white, warn=amber, error=red, debug=gray
- **Format**: `HH:MM:SS [bot-id] message`

### Data Source

Logs come from `useTelemetryStore().recentLogs()`. The store is auto-populated by the SSE hook when `log:entry` events are received from the Commander server.

---

## ActivityChart

Recharts timeline showing bot activity over time.

### Usage

```tsx
import { ActivityChart } from '@/components/telemetry';

function Dashboard() {
  return <ActivityChart height={300} timeWindow={60} />;
}
```

### Props

- `height?: number` — Chart height in pixels (default: 300)
- `timeWindow?: number` — Time window in minutes (default: 60)

### Features

- **5-minute buckets**: Data aggregated into 5-minute intervals
- **Multi-metric**: Shows total messages, warnings, and errors
- **Dark theme**: Matches command center aesthetic
- **Custom tooltip**: Displays breakdown on hover
- **Gradient line**: Cyan gradient for visual appeal

### Data Source

Activity is computed from `useTelemetryStore().logs`, aggregated into time buckets. Only logs within the `timeWindow` are displayed.

---

## Styling

Both components follow the command center design:
- Dark backgrounds (#12121a)
- Monospace JetBrains Mono font for data
- Cyan accents for interactive elements
- Sharp edges (minimal border-radius)
- Panel class with border

## Example: Combined Telemetry View

```tsx
import { LogStream, ActivityChart } from '@/components/telemetry';

function TelemetryView() {
  return (
    <div className="space-y-6">
      <ActivityChart height={250} timeWindow={120} />
      <LogStream maxLines={1000} height="calc(100vh - 400px)" />
    </div>
  );
}
```

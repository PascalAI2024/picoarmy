import { Command } from 'lucide-react';
import { StatusLED } from '../ui/StatusLED';
import { useEffect, useState } from 'react';
import { useFleetStore } from '../../stores/fleet';

export function TopBar() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const fleetStats = useFleetStore((state) => state.stats());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-border bg-bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-bg-surface/60">
      <div className="flex h-full items-center justify-between px-6">
        {/* Fleet stats */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <StatusLED status="online" size="sm" />
            <span className="mono-data text-sm">
              <span className="text-status-online font-medium">{fleetStats.online}</span>
              <span className="text-text-muted ml-1">online</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <StatusLED status="idle" size="sm" />
            <span className="mono-data text-sm">
              <span className="text-status-idle font-medium">{fleetStats.idle}</span>
              <span className="text-text-muted ml-1">idle</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <StatusLED status="offline" size="sm" />
            <span className="mono-data text-sm">
              <span className="text-status-offline font-medium">{fleetStats.offline}</span>
              <span className="text-text-muted ml-1">offline</span>
            </span>
          </div>
        </div>

        {/* Right side: Command bar trigger + clock */}
        <div className="flex items-center gap-4">
          {/* Command bar trigger */}
          <button
            className="
              flex items-center gap-2
              px-3 py-1.5
              bg-bg-elevated hover:bg-bg-surface
              border border-border hover:border-border-hover
              text-text-secondary
              transition-all
            "
            title="Open command palette (⌘K)"
          >
            <Command className="h-3.5 w-3.5" />
            <span className="mono-data text-xs">⌘K</span>
          </button>

          {/* System clock */}
          <div className="mono-data text-sm text-text-secondary tabular-nums">
            {formatTime(currentTime)}
          </div>
        </div>
      </div>
    </header>
  );
}

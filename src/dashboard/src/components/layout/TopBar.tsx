import { Command, Menu } from 'lucide-react';
import { StatusLED } from '../ui/StatusLED';
import { useEffect, useState } from 'react';
import { useFleetStore } from '../../stores/fleet';

interface TopBarProps {
  sseConnected: boolean;
  sseError: string | null;
  onCommandBarOpen: () => void;
  onMobileMenuToggle?: () => void;
}

export function TopBar({ sseConnected, sseError, onCommandBarOpen, onMobileMenuToggle }: TopBarProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const bots = useFleetStore((state) => state.bots);
  const fleetStats = {
    online: bots.filter((b) => b.status === 'online').length,
    idle: bots.filter((b) => b.status === 'idle').length,
    offline: bots.filter((b) => b.status === 'offline').length,
    total: bots.length,
  };

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
        {/* Mobile hamburger */}
        <button
          onClick={onMobileMenuToggle}
          className="md:hidden p-2 text-text-muted hover:text-text-primary transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>

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

        {/* Right side: SSE indicator + Command bar trigger + clock */}
        <div className="flex items-center gap-4">
          {/* SSE connection indicator */}
          <div className="flex items-center gap-2" title={sseError || (sseConnected ? 'SSE connected' : 'SSE disconnected')}>
            <div className={`h-2 w-2 rounded-full ${sseConnected ? 'bg-status-online animate-pulse' : 'bg-status-offline'}`} />
            <span className="mono-data text-xs text-text-muted">
              {sseConnected ? 'LIVE' : 'DISCONNECTED'}
            </span>
          </div>

          {/* Command bar trigger */}
          <button
            onClick={onCommandBarOpen}
            className="
              flex items-center gap-2
              px-3 py-1.5
              bg-bg-elevated hover:bg-bg-surface
              border border-border hover:border-border-hover
              text-text-secondary
              transition-all
            "
            title="Open command palette"
          >
            <Command className="h-3.5 w-3.5" />
            <span className="mono-data text-xs">K</span>
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

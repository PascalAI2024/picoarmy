import { StatusLED } from '../ui/StatusLED';
import { useFleetStore } from '../../stores/fleet';

export function FleetStats() {
  const { bots } = useFleetStore();
  const stats = {
    online: bots.filter(b => b.status === 'online').length,
    idle: bots.filter(b => b.status === 'idle').length,
    offline: bots.filter(b => b.status === 'offline').length,
    spawning: bots.filter(b => b.status === 'spawning').length,
  };

  return (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-2">
        <StatusLED status="online" size="sm" />
        <span className="mono-data text-sm">
          <span className="text-status-online font-medium">{stats.online}</span>
          <span className="text-text-muted ml-1">online</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <StatusLED status="idle" size="sm" />
        <span className="mono-data text-sm">
          <span className="text-status-idle font-medium">{stats.idle}</span>
          <span className="text-text-muted ml-1">idle</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <StatusLED status="offline" size="sm" />
        <span className="mono-data text-sm">
          <span className="text-status-offline font-medium">{stats.offline}</span>
          <span className="text-text-muted ml-1">offline</span>
        </span>
      </div>

      {stats.spawning > 0 && (
        <div className="flex items-center gap-2">
          <StatusLED status="spawning" size="sm" />
          <span className="mono-data text-sm">
            <span className="text-status-spawning font-medium">{stats.spawning}</span>
            <span className="text-text-muted ml-1">spawning</span>
          </span>
        </div>
      )}
    </div>
  );
}

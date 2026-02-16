import { useFleetStore } from '../../stores/fleet';

export function FleetHealthBar() {
  const { bots } = useFleetStore();

  const onlineCount = bots.filter((b) => b.status === 'online').length;
  const idleCount = bots.filter((b) => b.status === 'idle').length;
  const offlineCount = bots.filter((b) => b.status === 'offline').length;
  const spawningCount = bots.filter((b) => b.status === 'spawning').length;
  const total = bots.length;

  if (total === 0) {
    return null;
  }

  const onlinePercent = (onlineCount / total) * 100;
  const idlePercent = (idleCount / total) * 100;
  const spawningPercent = (spawningCount / total) * 100;
  const offlinePercent = (offlineCount / total) * 100;

  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-3">
        <span className="mono-data text-xs text-text-muted uppercase tracking-wider">
          Fleet Health
        </span>
        <span className="mono-data text-xs text-text-secondary">
          {total} bot{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Health bar */}
      <div className="h-2 bg-bg-elevated rounded-full overflow-hidden flex">
        {onlineCount > 0 && (
          <div
            className="bg-status-online transition-all duration-500"
            style={{ width: `${onlinePercent}%` }}
            title={`${onlineCount} online`}
          />
        )}
        {idleCount > 0 && (
          <div
            className="bg-status-idle transition-all duration-500"
            style={{ width: `${idlePercent}%` }}
            title={`${idleCount} idle`}
          />
        )}
        {spawningCount > 0 && (
          <div
            className="bg-status-spawning transition-all duration-500"
            style={{ width: `${spawningPercent}%` }}
            title={`${spawningCount} spawning`}
          />
        )}
        {offlineCount > 0 && (
          <div
            className="bg-status-offline transition-all duration-500"
            style={{ width: `${offlinePercent}%` }}
            title={`${offlineCount} offline`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-status-online" />
          <span className="text-text-secondary mono-data">{onlineCount}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-status-idle" />
          <span className="text-text-secondary mono-data">{idleCount}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-status-spawning" />
          <span className="text-text-secondary mono-data">{spawningCount}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-status-offline" />
          <span className="text-text-secondary mono-data">{offlineCount}</span>
        </div>
      </div>
    </div>
  );
}

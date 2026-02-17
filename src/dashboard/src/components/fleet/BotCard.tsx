import { StatusLED } from '../ui/StatusLED';
import type { Bot } from '../../lib/types';
import { formatUptime, formatRelativeTime, formatMemory, formatTTL } from '../../lib/format';

interface BotCardProps {
  bot: Bot;
  onClick?: () => void;
}

const statusBorderMap = {
  online: 'border-l-status-online',
  idle: 'border-l-status-idle',
  offline: 'border-l-status-offline',
  spawning: 'border-l-status-spawning',
};

const statusTextMap = {
  online: 'text-status-online',
  idle: 'text-status-idle',
  offline: 'text-status-offline',
  spawning: 'text-status-spawning',
};

export function BotCard({ bot, onClick }: BotCardProps) {
  return (
    <button
      onClick={onClick}
      aria-label={`View bot ${bot.name}, soul ${bot.soul_name}, status ${bot.status}`}
      className={`
        group relative
        w-full text-left
        bg-bg-surface border border-border
        border-l-2 ${statusBorderMap[bot.status]}
        p-4
        hover:border-border-hover hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.01]
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:ring-offset-2 focus:ring-offset-bg
        before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-200
        before:bg-gradient-to-br before:from-accent-cyan/5 before:to-transparent
        hover:before:opacity-100
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="mono-data font-semibold text-base text-text-primary mb-1">
            {bot.name}
          </h3>
          <p className="text-xs text-text-secondary">
            {bot.soul_name}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <StatusLED status={bot.status} size="md" />
          <span className={`text-xs font-medium ${statusTextMap[bot.status]}`}>
            {bot.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Type + Provider badges */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <span className="
          inline-flex items-center gap-1
          px-2 py-0.5
          bg-bg-elevated border border-border
          text-xs text-text-muted
        ">
          {bot.is_permanent ? (
            <span>∞ permanent</span>
          ) : (
            <span className="text-status-idle">⏱ {formatTTL(bot.ttl_seconds)}</span>
          )}
        </span>
        {typeof bot.metadata?.provider === 'string' && (
          <span className="
            inline-flex items-center gap-1
            px-2 py-0.5
            bg-accent-cyan/10 border border-accent-cyan/30
            text-xs text-accent-cyan mono-data
          ">
            {bot.metadata.provider}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
            Uptime
          </div>
          <div className="mono-data text-xs text-text-primary">
            {formatUptime(bot.uptime_seconds)}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
            Memory
          </div>
          <div className="mono-data text-xs text-text-primary">
            {formatMemory(bot.memory_mb)}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
            Last HB
          </div>
          <div className="mono-data text-xs text-text-primary">
            {formatRelativeTime(bot.last_heartbeat)}
          </div>
        </div>
      </div>
    </button>
  );
}

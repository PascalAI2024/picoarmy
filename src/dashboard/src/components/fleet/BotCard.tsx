import { StatusLED } from '../ui/StatusLED';
import type { Bot } from '../../lib/mock-data';

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
      className={`
        group
        w-full text-left
        bg-bg-surface border border-border
        border-l-2 ${statusBorderMap[bot.status]}
        p-4
        hover:border-border-hover hover:shadow-lg
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:ring-offset-2 focus:ring-offset-bg
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="mono-data font-semibold text-base text-text-primary mb-1">
            {bot.name}
          </h3>
          <p className="text-xs text-text-secondary">
            {bot.soul}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <StatusLED status={bot.status} size="md" />
          <span className={`text-xs font-medium ${statusTextMap[bot.status]}`}>
            {bot.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Type badge */}
      <div className="mb-3">
        <span className="
          inline-flex items-center gap-1
          px-2 py-0.5
          bg-bg-elevated border border-border
          text-xs text-text-muted
        ">
          {bot.type === 'ephemeral' && bot.ttl && (
            <span className="text-status-idle">⏱ {bot.ttl}</span>
          )}
          {bot.type === 'permanent' && (
            <span>∞ permanent</span>
          )}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
            Uptime
          </div>
          <div className="mono-data text-xs text-text-primary">
            {bot.uptime}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
            Memory
          </div>
          <div className="mono-data text-xs text-text-primary">
            {bot.memory}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
            Last HB
          </div>
          <div className="mono-data text-xs text-text-primary">
            {bot.lastHeartbeat}
          </div>
        </div>
      </div>
    </button>
  );
}

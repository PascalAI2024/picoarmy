import { Plus } from 'lucide-react';
import { BotCard } from './BotCard';
import { useFleetStore } from '../../stores/fleet';
import { useState } from 'react';
import type { Bot } from '../../lib/types';

interface FleetGridProps {
  onBotClick?: (botId: string) => void;
  onSpawnClick?: () => void;
}

export function FleetGrid({ onBotClick, onSpawnClick }: FleetGridProps) {
  const { filteredBots: getFilteredBots, filter, setFilter } = useFleetStore();
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'permanent'>('name');

  const displayBots = getFilteredBots().sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'status') return a.status.localeCompare(b.status);
    if (sortBy === 'permanent') {
      return a.is_permanent === b.is_permanent ? 0 : a.is_permanent ? -1 : 1;
    }
    return 0;
  });

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">Filter:</span>
          <div className="flex gap-1">
            {(['all', 'online', 'idle', 'offline'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`
                  px-3 py-1.5 text-xs
                  border
                  transition-colors
                  ${filter === f
                    ? 'bg-accent-cyan/20 border-accent-cyan text-accent-cyan'
                    : 'bg-bg-surface border-border text-text-muted hover:border-border-hover'
                  }
                `}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">Sort:</span>
          <div className="flex gap-1">
            {(['name', 'status', 'permanent'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`
                  px-3 py-1.5 text-xs
                  border
                  transition-colors
                  ${sortBy === s
                    ? 'bg-accent-cyan/20 border-accent-cyan text-accent-cyan'
                    : 'bg-bg-surface border-border text-text-muted hover:border-border-hover'
                  }
                `}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto mono-data text-sm text-text-muted">
          {displayBots.length} bot{displayBots.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {displayBots.map((bot) => (
          <BotCard
            key={bot.id}
            bot={bot}
            onClick={() => onBotClick?.(bot.id)}
          />
        ))}

        {/* Spawn bot tile */}
        <button
          onClick={onSpawnClick}
          className="
            group
            min-h-[200px]
            bg-bg-surface/50 border-2 border-dashed border-border
            hover:border-accent-cyan hover:bg-accent-cyan/5
            transition-all duration-200
            flex flex-col items-center justify-center gap-3
            focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:ring-offset-2 focus:ring-offset-bg
          "
        >
          <div className="
            w-12 h-12 rounded-full
            bg-accent-cyan/10 group-hover:bg-accent-cyan/20
            border border-accent-cyan/30 group-hover:border-accent-cyan/50
            flex items-center justify-center
            transition-all
          ">
            <Plus className="w-6 h-6 text-accent-cyan" />
          </div>
          <span className="text-sm font-medium text-accent-cyan">
            Spawn Bot
          </span>
        </button>
      </div>
    </div>
  );
}

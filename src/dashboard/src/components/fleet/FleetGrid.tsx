import { Plus, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { BotCard } from './BotCard';
import { useFleetStore } from '../../stores/fleet';
import { useState } from 'react';
import type { Bot } from '../../lib/types';

interface FleetGridProps {
  onBotClick?: (botId: string) => void;
  onSpawnClick?: () => void;
}

interface SwarmGroup {
  name: string;
  bots: Bot[];
}

export function FleetGrid({ onBotClick, onSpawnClick }: FleetGridProps) {
  const { filteredBots: getFilteredBots, filter, setFilter } = useFleetStore();
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'permanent'>('name');
  const [collapsedSwarms, setCollapsedSwarms] = useState<Set<string>>(new Set());

  const displayBots = getFilteredBots().sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'status') return a.status.localeCompare(b.status);
    if (sortBy === 'permanent') {
      return a.is_permanent === b.is_permanent ? 0 : a.is_permanent ? -1 : 1;
    }
    return 0;
  });

  // Group bots: swarm bots grouped by swarm name, standalone bots separate
  const { swarmGroups, standaloneBots } = (() => {
    const swarms = new Map<string, Bot[]>();
    const standalone: Bot[] = [];

    for (const bot of displayBots) {
      const swarmName = typeof bot.metadata?.swarm === 'string' ? bot.metadata.swarm : null;
      if (swarmName) {
        const group = swarms.get(swarmName) || [];
        group.push(bot);
        swarms.set(swarmName, group);
      } else {
        standalone.push(bot);
      }
    }

    const groups: SwarmGroup[] = Array.from(swarms.entries()).map(([name, bots]) => ({
      name,
      bots,
    }));

    return { swarmGroups: groups, standaloneBots: standalone };
  })();

  const toggleSwarm = (name: string) => {
    setCollapsedSwarms(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

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
          {swarmGroups.length > 0 && ` · ${swarmGroups.length} swarm${swarmGroups.length !== 1 ? 's' : ''}`}
        </div>
      </div>

      {/* Grid */}
      {displayBots.length === 0 ? (
        <div className="panel flex flex-col items-center justify-center py-16">
          <div className="w-20 h-20 mb-6 rounded-full bg-accent-cyan/10 border-2 border-accent-cyan/30 flex items-center justify-center">
            <Plus className="w-10 h-10 text-accent-cyan" />
          </div>
          <h3 className="mono-data text-xl text-text-primary mb-3">No Bots Deployed</h3>
          <p className="text-sm text-text-secondary text-center max-w-md mb-6">
            Your fleet is empty. Spawn your first bot to get started.
          </p>
          <button
            onClick={onSpawnClick}
            className="
              px-6 py-3 text-sm font-medium
              bg-accent-cyan/20 border-2 border-accent-cyan
              text-accent-cyan
              hover:bg-accent-cyan/30 hover:scale-105
              transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:ring-offset-2 focus:ring-offset-bg
            "
          >
            Spawn Your First Bot
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Swarm groups */}
          {swarmGroups.map((swarm) => {
            const collapsed = collapsedSwarms.has(swarm.name);
            const onlineCount = swarm.bots.filter(b => b.status === 'online').length;

            return (
              <div key={swarm.name} className="border border-accent-cyan/20 bg-accent-cyan/[0.02]">
                {/* Swarm header */}
                <button
                  onClick={() => toggleSwarm(swarm.name)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent-cyan/5 transition-colors"
                >
                  {collapsed
                    ? <ChevronRight className="h-4 w-4 text-accent-cyan shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-accent-cyan shrink-0" />
                  }
                  <Users className="h-4 w-4 text-accent-cyan shrink-0" />
                  <span className="mono-data text-sm font-semibold text-accent-cyan">
                    {swarm.name}
                  </span>
                  <span className="text-xs text-text-muted">
                    {swarm.bots.length} bot{swarm.bots.length !== 1 ? 's' : ''}
                  </span>
                  <span className={`text-xs ml-auto ${onlineCount === swarm.bots.length ? 'text-status-online' : 'text-status-idle'}`}>
                    {onlineCount}/{swarm.bots.length} online
                  </span>
                </button>

                {/* Swarm bots */}
                {!collapsed && (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 px-4 pb-4">
                    {swarm.bots.map((bot, index) => (
                      <div
                        key={bot.id}
                        style={{
                          animation: `fade-slide-in 0.3s ease-out ${index * 30}ms forwards`,
                          opacity: 0,
                        }}
                      >
                        <BotCard
                          bot={bot}
                          onClick={() => onBotClick?.(bot.id)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Standalone bots */}
          {standaloneBots.length > 0 && (
            <>
              {swarmGroups.length > 0 && (
                <div className="text-xs text-text-muted uppercase tracking-wider px-1">
                  Standalone Bots
                </div>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                {standaloneBots.map((bot, index) => (
                  <div
                    key={bot.id}
                    style={{
                      animation: `fade-slide-in 0.4s ease-out ${index * 50}ms forwards`,
                      opacity: 0,
                    }}
                  >
                    <BotCard
                      bot={bot}
                      onClick={() => onBotClick?.(bot.id)}
                    />
                  </div>
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
            </>
          )}

          {/* If only swarms, still show spawn button */}
          {standaloneBots.length === 0 && (
            <div className="flex justify-center">
              <button
                onClick={onSpawnClick}
                className="
                  px-6 py-3 text-sm font-medium
                  bg-bg-surface border-2 border-dashed border-border
                  text-accent-cyan
                  hover:border-accent-cyan hover:bg-accent-cyan/5
                  transition-all duration-200
                "
              >
                <span className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Spawn Bot
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

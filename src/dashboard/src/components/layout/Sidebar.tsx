import { Database, Grid3x3, Cpu, ScrollText, Plus } from 'lucide-react';
import { StatusLED } from '../ui/StatusLED';
import { useFleetStore } from '../../stores/fleet';

const navItems = [
  { label: 'Fleet', icon: Grid3x3, href: '/' },
  { label: 'Souls', icon: Cpu, href: '/souls' },
  { label: 'Skills', icon: Database, href: '/skills' },
  { label: 'Logs', icon: ScrollText, href: '/logs' },
];

interface SidebarProps {
  onSpawnClick?: () => void;
}

export function Sidebar({ onSpawnClick }: SidebarProps) {
  const { bots, selectBot } = useFleetStore();
  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-bg-surface border-r border-border flex flex-col">
      {/* Branding */}
      <div className="p-6 border-b border-border">
        <h1 className="mono-data text-lg font-semibold tracking-tight text-text-primary">
          PICOARMY
        </h1>
        <p className="text-xs text-text-muted mt-1">Fleet Command</p>
      </div>

      {/* Fleet section */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-6">
          <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
            Fleet
          </h2>
          <div className="space-y-1">
            {bots.map((bot) => (
              <button
                key={bot.id}
                onClick={() => selectBot(bot.id)}
                className="
                  w-full flex items-center gap-2
                  px-3 py-2 rounded-sm
                  hover:bg-bg-elevated
                  text-sm text-text-secondary
                  transition-colors
                "
              >
                <StatusLED status={bot.status} size="sm" />
                <span className="mono-data">{bot.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <nav>
          <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
            Navigation
          </h2>
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className="
                    flex items-center gap-3
                    px-3 py-2 rounded-sm
                    hover:bg-bg-elevated
                    text-sm text-text-secondary
                    transition-colors
                  "
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Spawn button */}
      <div className="p-4 border-t border-border">
        <button
          onClick={onSpawnClick}
          className="
            w-full flex items-center justify-center gap-2
            px-4 py-3
            bg-accent-cyan/10 hover:bg-accent-cyan/20
            border border-accent-cyan/30 hover:border-accent-cyan/50
            text-accent-cyan
            transition-all
            glow-cyan
          "
        >
          <Plus className="h-4 w-4" />
          <span className="font-medium text-sm">Spawn Bot</span>
        </button>
      </div>
    </aside>
  );
}

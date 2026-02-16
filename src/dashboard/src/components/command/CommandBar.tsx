// Terminal-style command palette (Cmd+K)

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog } from '../ui/Dialog';
import { useFleetStore } from '../../stores';
import { useFleet } from '../../hooks';

interface Command {
  id: string;
  label: string;
  keywords: string[];
  action: () => void | Promise<void>;
}

interface CommandBarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandBar({ open, onOpenChange }: CommandBarProps) {
  const [input, setInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { bots, selectBot } = useFleetStore();
  const { spawnBot, destroyBot } = useFleet();

  // Build command list
  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [
      {
        id: 'spawn-assistant',
        label: 'spawn assistant',
        keywords: ['spawn', 'create', 'new', 'assistant'],
        action: async () => {
          await spawnBot({
            name: `bot-${Date.now()}`,
            soul_name: 'assistant',
            is_permanent: false,
            ttl_seconds: 3600,
          });
          onOpenChange(false);
        },
      },
      {
        id: 'spawn-seo',
        label: 'spawn seo-writer',
        keywords: ['spawn', 'create', 'new', 'seo'],
        action: async () => {
          await spawnBot({
            name: `seo-${Date.now()}`,
            soul_name: 'seo-writer',
            is_permanent: false,
            ttl_seconds: 7200,
          });
          onOpenChange(false);
        },
      },
      {
        id: 'spawn-support',
        label: 'spawn support-agent',
        keywords: ['spawn', 'create', 'new', 'support'],
        action: async () => {
          await spawnBot({
            name: `support-${Date.now()}`,
            soul_name: 'support-agent',
            is_permanent: false,
            ttl_seconds: 3600,
          });
          onOpenChange(false);
        },
      },
      {
        id: 'list-bots',
        label: 'list bots',
        keywords: ['list', 'show', 'all', 'bots'],
        action: () => {
          selectBot(null);
          onOpenChange(false);
        },
      },
    ];

    // Add bot-specific commands
    bots.forEach((bot) => {
      cmds.push({
        id: `go-${bot.id}`,
        label: `go ${bot.name}`,
        keywords: ['go', 'navigate', 'open', bot.name, bot.id],
        action: () => {
          selectBot(bot.id);
          onOpenChange(false);
        },
      });

      cmds.push({
        id: `destroy-${bot.id}`,
        label: `destroy ${bot.name}`,
        keywords: ['destroy', 'kill', 'stop', 'remove', bot.name],
        action: async () => {
          if (confirm(`Destroy bot "${bot.name}"?`)) {
            await destroyBot(bot.id);
          }
          onOpenChange(false);
        },
      });
    });

    return cmds;
  }, [bots, spawnBot, destroyBot, selectBot, onOpenChange]);

  // Filter commands based on input
  const filteredCommands = useMemo(() => {
    if (!input.trim()) return commands;

    const query = input.toLowerCase().trim();
    return commands.filter((cmd) => {
      return cmd.keywords.some((keyword) => keyword.includes(query));
    });
  }, [input, commands]);

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filteredCommands[selectedIndex];
        if (cmd) {
          cmd.action();
        }
      }
    },
    [filteredCommands, selectedIndex]
  );

  // Clear input when dialog closes
  useEffect(() => {
    if (!open) {
      setInput('');
      setSelectedIndex(0);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="fixed inset-0 flex items-start justify-center pt-[20vh] z-50">
        <div
          className="w-full max-w-2xl surface-glass border-2 border-cyan-500 rounded-sm shadow-2xl"
          style={{ boxShadow: '0 0 40px rgba(6, 182, 212, 0.3)' }}
        >
          {/* Command input */}
          <div className="flex items-center border-b border-[#1e1e2e] px-4 py-3">
            <span className="mono-data text-cyan-400 mr-2">&gt;</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command..."
              className="flex-1 bg-transparent mono-data text-white placeholder-gray-500 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Command list */}
          <div className="max-h-[400px] overflow-y-auto">
            {filteredCommands.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 mono-data">
                No commands found
              </div>
            ) : (
              <div>
                {filteredCommands.map((cmd, index) => (
                  <button
                    key={cmd.id}
                    onClick={() => cmd.action()}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full text-left px-4 py-2 mono-data transition-colors ${
                      index === selectedIndex
                        ? 'bg-cyan-500/10 text-cyan-300 border-l-2 border-cyan-500'
                        : 'text-gray-300 hover:bg-white/5 border-l-2 border-transparent'
                    }`}
                  >
                    {cmd.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[#1e1e2e] px-4 py-2 flex items-center justify-between text-xs text-gray-500">
            <div className="mono-data">
              ↑↓ navigate · ↵ execute · esc close
            </div>
            <div className="mono-data">
              {filteredCommands.length} command{filteredCommands.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

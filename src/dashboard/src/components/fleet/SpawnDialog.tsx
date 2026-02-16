import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
import { useFleet } from '../../hooks/useFleet';
import type { SoulTemplate } from '../../lib/types';

interface SpawnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SpawnDialog({ open, onOpenChange }: SpawnDialogProps) {
  const [name, setName] = useState('');
  const [soul, setSoul] = useState('');
  const [type, setType] = useState<'permanent' | 'ephemeral'>('ephemeral');
  const [ttl, setTtl] = useState('2');
  const [souls, setSouls] = useState<SoulTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const { spawnBot, fetchSouls } = useFleet();

  // Fetch available souls on mount
  useEffect(() => {
    if (open) {
      fetchSouls()
        .then(setSouls)
        .catch((err) => {
          console.error('Failed to load souls:', err);
        });
    }
  }, [open, fetchSouls]);

  const handleDeploy = async () => {
    if (!name || !soul) return;

    setLoading(true);
    try {
      await spawnBot({
        name,
        soul_name: soul,
        is_permanent: type === 'permanent',
        ttl_seconds: type === 'ephemeral' ? parseInt(ttl) * 3600 : undefined,
      });

      // Close dialog and reset form
      onOpenChange(false);
      setName('');
      setSoul('');
      setType('ephemeral');
      setTtl('2');
    } catch (err) {
      console.error('Failed to spawn bot:', err);
      toast.error('Failed to spawn bot');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-accent-cyan">▸</span>
            Deploy New Bot
          </DialogTitle>
          <DialogDescription>
            Configure and spawn a new picobot instance in the fleet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Bot name */}
          <div className="space-y-2">
            <label htmlFor="bot-name" className="text-sm font-medium text-text-primary">
              Bot Name
            </label>
            <input
              id="bot-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-bot-name"
              className="
                w-full h-10
                bg-bg-surface border border-border
                px-3 py-2
                text-sm text-text-primary
                placeholder:text-text-muted
                focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:ring-offset-2 focus:ring-offset-bg
                hover:border-border-hover
              "
            />
          </div>

          {/* Soul template */}
          <div className="space-y-2">
            <label htmlFor="soul-template" className="text-sm font-medium text-text-primary">
              Soul Template
            </label>
            <Select value={soul} onValueChange={setSoul}>
              <SelectTrigger id="soul-template">
                <SelectValue placeholder="Select a soul..." />
              </SelectTrigger>
              <SelectContent>
                {souls.map((template) => (
                  <SelectItem key={template.name} value={template.name}>
                    {template.name} - {template.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type toggle */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">
              Bot Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType('permanent')}
                className={`
                  flex-1 px-4 py-2 text-sm
                  border transition-colors
                  ${type === 'permanent'
                    ? 'bg-accent-cyan/20 border-accent-cyan text-accent-cyan'
                    : 'bg-bg-surface border-border text-text-muted hover:border-border-hover'
                  }
                `}
              >
                ∞ Permanent
              </button>
              <button
                type="button"
                onClick={() => setType('ephemeral')}
                className={`
                  flex-1 px-4 py-2 text-sm
                  border transition-colors
                  ${type === 'ephemeral'
                    ? 'bg-accent-cyan/20 border-accent-cyan text-accent-cyan'
                    : 'bg-bg-surface border-border text-text-muted hover:border-border-hover'
                  }
                `}
              >
                ⏱ Ephemeral
              </button>
            </div>
          </div>

          {/* TTL (only for ephemeral) */}
          {type === 'ephemeral' && (
            <div className="space-y-2">
              <label htmlFor="ttl" className="text-sm font-medium text-text-primary">
                Time to Live (hours)
              </label>
              <input
                id="ttl"
                type="number"
                min="1"
                max="72"
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
                className="
                  w-full h-10
                  bg-bg-surface border border-border
                  px-3 py-2
                  text-sm text-text-primary mono-data
                  focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:ring-offset-2 focus:ring-offset-bg
                  hover:border-border-hover
                "
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="
              px-4 py-2 text-sm
              bg-bg-surface border border-border
              text-text-secondary
              hover:border-border-hover hover:text-text-primary
              transition-colors
            "
          >
            Cancel
          </button>
          <button
            onClick={handleDeploy}
            disabled={!name || !soul || loading}
            className="
              px-6 py-2 text-sm font-medium
              bg-accent-cyan/20 border border-accent-cyan
              text-accent-cyan
              hover:bg-accent-cyan/30 hover:shadow-glow-cyan
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all
            "
          >
            {loading ? 'DEPLOYING...' : 'DEPLOY'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

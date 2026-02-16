import { useState, useEffect } from 'react';
import { Shell } from './components/layout/Shell';
import { FleetGrid } from './components/fleet/FleetGrid';
import { SpawnDialog } from './components/fleet/SpawnDialog';
import { BotDetail } from './components/fleet/BotDetail';
import { useFleet } from './hooks/useFleet';
import { useSSE } from './hooks/useSSE';
import { useFleetStore } from './stores/fleet';

function App() {
  const [spawnDialogOpen, setSpawnDialogOpen] = useState(false);
  const { fetchFleet } = useFleet();
  const { connected } = useSSE();
  const { selectBot, selectedBot: getSelectedBot } = useFleetStore();

  const selectedBot = getSelectedBot();

  // Fetch initial fleet data on mount
  useEffect(() => {
    fetchFleet().catch((err) => {
      console.error('Failed to load fleet:', err);
    });
  }, [fetchFleet]);

  return (
    <Shell onSpawnClick={() => setSpawnDialogOpen(true)}>
      <div className="space-y-6">
        {/* Fleet Grid */}
        {!selectedBot && (
          <>
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
                Fleet Overview
              </h1>
            </div>

            <FleetGrid
              onBotClick={(botId) => selectBot(botId)}
              onSpawnClick={() => setSpawnDialogOpen(true)}
            />
          </>
        )}

        {/* Bot Detail */}
        {selectedBot && (
          <>
            <button
              onClick={() => selectBot(null)}
              className="text-sm text-accent-cyan hover:text-accent-cyan/80"
            >
              ← Back to Fleet
            </button>

            <BotDetail
              bot={selectedBot}
              onDestroy={() => {
                console.log('Destroy bot:', selectedBot.id);
                selectBot(null);
              }}
              onRestart={() => {
                console.log('Restart bot:', selectedBot.id);
              }}
            />
          </>
        )}

        {/* Spawn Dialog */}
        <SpawnDialog
          open={spawnDialogOpen}
          onOpenChange={setSpawnDialogOpen}
        />
      </div>
    </Shell>
  );
}

export default App

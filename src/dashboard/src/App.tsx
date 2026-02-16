import { useState } from 'react';
import { Shell } from './components/layout/Shell';
import { FleetGrid } from './components/fleet/FleetGrid';
import { SpawnDialog } from './components/fleet/SpawnDialog';
import { BotDetail } from './components/fleet/BotDetail';
import { mockBots } from './lib/mock-data';

function App() {
  const [spawnDialogOpen, setSpawnDialogOpen] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);

  const selectedBot = mockBots.find(b => b.id === selectedBotId);

  return (
    <Shell>
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
              onBotClick={(botId) => setSelectedBotId(botId)}
              onSpawnClick={() => setSpawnDialogOpen(true)}
            />
          </>
        )}

        {/* Bot Detail */}
        {selectedBot && (
          <>
            <button
              onClick={() => setSelectedBotId(null)}
              className="text-sm text-accent-cyan hover:text-accent-cyan/80"
            >
              ← Back to Fleet
            </button>

            <BotDetail
              bot={selectedBot}
              onDestroy={() => {
                console.log('Destroy bot:', selectedBot.id);
                setSelectedBotId(null);
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

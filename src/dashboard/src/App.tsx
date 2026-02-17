import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { Shell } from './components/layout/Shell';
import { FleetGrid } from './components/fleet/FleetGrid';
import { SpawnDialog } from './components/fleet/SpawnDialog';
import { BotDetail } from './components/fleet/BotDetail';
import { CommandBar } from './components/command/CommandBar';
import { CommanderChat } from './components/commander/CommanderChat';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { SoulsPage } from './pages/SoulsPage';
import { LogsPage } from './pages/LogsPage';
import { SkillsPage } from './pages/SkillsPage';
import { useFleet } from './hooks/useFleet';
import { useSSE } from './hooks/useSSE';
import { useCommandBar } from './hooks/useCommandBar';
import { useFleetStore } from './stores/fleet';

function FleetPage() {
  const [spawnDialogOpen, setSpawnDialogOpen] = useState(false);
  const navigate = useNavigate();
  const { loading } = useFleetStore();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          Fleet Overview
        </h1>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="panel animate-pulse h-40">
              <div className="h-4 bg-bg-elevated rounded w-1/3 mb-4" />
              <div className="h-3 bg-bg-elevated rounded w-1/2 mb-2" />
              <div className="h-3 bg-bg-elevated rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <FleetGrid
          onBotClick={(botId) => navigate(`/fleet/${botId}`)}
          onSpawnClick={() => setSpawnDialogOpen(true)}
        />
      )}

      <SpawnDialog
        open={spawnDialogOpen}
        onOpenChange={setSpawnDialogOpen}
      />
    </div>
  );
}

function BotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { bots } = useFleetStore();
  const { destroyBot } = useFleet();

  const bot = bots.find((b) => b.id === id);

  if (!bot) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/')}
          className="text-sm text-accent-cyan hover:text-accent-cyan/80"
        >
          Back to Fleet
        </button>
        <div className="panel text-center py-12">
          <p className="text-text-muted">Bot not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/')}
        className="text-sm text-accent-cyan hover:text-accent-cyan/80"
      >
        Back to Fleet
      </button>

      <BotDetail
        bot={bot}
        onDestroy={async () => {
          try {
            await destroyBot(bot.id);
            toast.success(`Bot "${bot.name}" destroyed`);
            navigate('/');
          } catch {
            toast.error(`Failed to destroy "${bot.name}"`);
          }
        }}
        onRestart={() => {
          toast.info(`Restart requested for "${bot.name}"`);
        }}
      />
    </div>
  );
}




function App() {
  const [spawnDialogOpen, setSpawnDialogOpen] = useState(false);
  const [commanderChatOpen, setCommanderChatOpen] = useState(false);
  const { fetchFleet } = useFleet();
  const { connected, error: sseError } = useSSE();
  const { open: commandBarOpen, setOpen: setCommandBarOpen } = useCommandBar();

  // Fetch initial fleet data on mount
  useEffect(() => {
    fetchFleet().catch((err) => {
      console.error('Failed to load fleet:', err);
    });
  }, [fetchFleet]);

  return (
    <ErrorBoundary>
      <Shell
        onSpawnClick={() => setSpawnDialogOpen(true)}
        sseConnected={connected}
        sseError={sseError}
        onCommandBarOpen={() => setCommandBarOpen(true)}
        onCommanderChatOpen={() => setCommanderChatOpen(true)}
      >
        <Routes>
          <Route path="/" element={<FleetPage />} />
          <Route path="/fleet/:id" element={<BotDetailPage />} />
          <Route path="/souls" element={<SoulsPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/logs" element={<LogsPage />} />
        </Routes>
      </Shell>

      {/* Commander AI Chat Panel */}
      <CommanderChat open={commanderChatOpen} onClose={() => setCommanderChatOpen(false)} />

      {/* Command Palette */}
      <CommandBar open={commandBarOpen} onOpenChange={setCommandBarOpen} />

      {/* Spawn Dialog (accessible from anywhere via sidebar) */}
      <SpawnDialog
        open={spawnDialogOpen}
        onOpenChange={setSpawnDialogOpen}
      />

      {/* Toast notifications */}
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: '#1a1a2e',
            border: '1px solid #2a2a3e',
            color: '#e0e0f0',
            fontFamily: 'var(--font-mono)',
          },
        }}
      />
    </ErrorBoundary>
  );
}

export default App

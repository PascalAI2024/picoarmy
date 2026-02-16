import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { StatusLED } from '../ui/StatusLED';
import type { Bot } from '../../lib/mock-data';

interface BotDetailProps {
  bot: Bot;
  onDestroy?: () => void;
  onRestart?: () => void;
}

export function BotDetail({ bot, onDestroy, onRestart }: BotDetailProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="mono-data text-2xl font-semibold text-text-primary">
              {bot.name}
            </h2>
            <StatusLED status={bot.status} size="lg" />
          </div>

          <div className="flex items-center gap-3">
            <span className="
              inline-flex items-center gap-1
              px-2 py-1
              bg-bg-elevated border border-border
              text-xs text-text-muted
            ">
              {bot.type === 'ephemeral' && bot.ttl && (
                <span className="text-status-idle">⏱ TTL: {bot.ttl}</span>
              )}
              {bot.type === 'permanent' && (
                <span>∞ permanent</span>
              )}
            </span>

            <span className="mono-data text-sm text-text-secondary">
              {bot.soul}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="soul">Soul</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="telemetry">Telemetry</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="panel">
              <div className="text-xs text-text-muted uppercase tracking-wider mb-2">
                Status
              </div>
              <div className="mono-data text-lg text-text-primary capitalize">
                {bot.status}
              </div>
            </div>

            <div className="panel">
              <div className="text-xs text-text-muted uppercase tracking-wider mb-2">
                Uptime
              </div>
              <div className="mono-data text-lg text-text-primary">
                {bot.uptime}
              </div>
            </div>

            <div className="panel">
              <div className="text-xs text-text-muted uppercase tracking-wider mb-2">
                Process ID
              </div>
              <div className="mono-data text-lg text-text-primary">
                {bot.pid || 'N/A'}
              </div>
            </div>

            <div className="panel">
              <div className="text-xs text-text-muted uppercase tracking-wider mb-2">
                Memory Usage
              </div>
              <div className="mono-data text-lg text-text-primary">
                {bot.memory}
              </div>
            </div>

            <div className="panel">
              <div className="text-xs text-text-muted uppercase tracking-wider mb-2">
                Last Heartbeat
              </div>
              <div className="mono-data text-lg text-text-primary">
                {bot.lastHeartbeat}
              </div>
            </div>

            <div className="panel">
              <div className="text-xs text-text-muted uppercase tracking-wider mb-2">
                Bot Type
              </div>
              <div className="mono-data text-lg text-text-primary capitalize">
                {bot.type}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="soul" className="space-y-4">
          <div className="panel">
            <div className="mono-data text-sm text-text-secondary space-y-4">
              <p># {bot.soul.toUpperCase()} SOUL</p>
              <p>You are a helpful AI assistant specialized in {bot.soul} tasks.</p>
              <p>Your primary goal is to assist users effectively and efficiently.</p>
              <p className="text-text-muted italic">
                // This is mock SOUL.md content. In production, this will be fetched from the bot's workspace.
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="skills" className="space-y-4">
          <div className="panel">
            <div className="text-sm text-text-secondary">
              <p className="mono-data mb-4">
                // Deployed skills: 0
              </p>
              <p className="text-text-muted">
                No skills deployed. Skills can be deployed from the Skills library.
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="telemetry" className="space-y-4">
          <div className="panel">
            <div className="mono-data text-xs text-text-secondary space-y-1">
              <p className="text-text-muted">// Recent activity</p>
              <p>14:32:15 [heartbeat] OK</p>
              <p>14:31:45 [message] User message received</p>
              <p>14:31:30 [tool] Executed filesystem.read</p>
              <p>14:30:00 [heartbeat] OK</p>
              <p className="text-text-muted pt-2">
                // This is mock telemetry. In production, this will stream from LogStream component.
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          <div className="flex gap-3">
            <button
              onClick={onRestart}
              className="
                px-4 py-2 text-sm
                bg-status-idle/20 border border-status-idle
                text-status-idle
                hover:bg-status-idle/30
                transition-colors
              "
            >
              Restart Bot
            </button>

            <button
              onClick={onDestroy}
              className="
                px-4 py-2 text-sm
                bg-status-offline/20 border border-status-offline
                text-status-offline
                hover:bg-status-offline/30
                transition-colors
              "
            >
              Destroy Bot
            </button>
          </div>

          <div className="panel">
            <p className="text-xs text-text-muted">
              Destructive actions cannot be undone. The bot process will be terminated
              and all workspace data will be archived.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

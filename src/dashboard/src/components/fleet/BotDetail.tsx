import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { StatusLED } from '../ui/StatusLED';
import type { Bot, ProviderPreset, MCPTool, BotSettings, SoulTemplate } from '../../lib/types';
import { fetchProviders, fetchTools, updateBotSettings, fetchSouls } from '../../lib/api';
import { formatUptime, formatRelativeTime, formatMemory, formatTTL } from '../../lib/format';

interface BotDetailProps {
  bot: Bot;
  onDestroy?: () => void;
  onRestart?: () => void;
}

export function BotDetail({ bot, onDestroy, onRestart }: BotDetailProps) {
  const [providers, setProviders] = useState<ProviderPreset[]>([]);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [souls, setSouls] = useState<SoulTemplate[]>([]);
  const [settings, setSettings] = useState<BotSettings>({
    soul_name: bot.soul_name,
    client_id: bot.client_id,
    provider: (bot.metadata?.provider as string) || undefined,
  });
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingTools, setLoadingTools] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoadingProviders(true);
      try {
        const [providersData, soulsData] = await Promise.all([
          fetchProviders(),
          fetchSouls(),
        ]);
        setProviders(providersData);
        setSouls(soulsData);
      } catch (error) {
        console.error('Failed to load providers/souls:', error);
      } finally {
        setLoadingProviders(false);
      }
    };
    loadData();
  }, []);

  const loadTools = async () => {
    setLoadingTools(true);
    try {
      const toolsData = await fetchTools(bot.name);
      setTools(toolsData);
    } catch (error) {
      console.error('Failed to load tools:', error);
    } finally {
      setLoadingTools(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await updateBotSettings(bot.id, settings);
      alert('Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleProviderChange = (providerName: string) => {
    const provider = providers.find(p => p.name === providerName);
    if (provider) {
      setSettings(prev => ({
        ...prev,
        provider: provider.name,
        model: provider.model,
      }));
    }
  };

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
              {bot.is_permanent ? (
                <span>∞ permanent</span>
              ) : (
                <span className="text-status-idle">⏱ TTL: {formatTTL(bot.ttl_seconds)}</span>
              )}
            </span>

            <span className="mono-data text-sm text-text-secondary">
              {bot.soul_name}
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
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
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
                {formatUptime(bot.uptime_seconds)}
              </div>
            </div>

            <div className="panel">
              <div className="text-xs text-text-muted uppercase tracking-wider mb-2">
                Bot ID
              </div>
              <div className="mono-data text-sm text-text-primary break-all">
                {bot.id}
              </div>
            </div>

            <div className="panel">
              <div className="text-xs text-text-muted uppercase tracking-wider mb-2">
                Memory Usage
              </div>
              <div className="mono-data text-lg text-text-primary">
                {formatMemory(bot.memory_mb)}
              </div>
            </div>

            <div className="panel">
              <div className="text-xs text-text-muted uppercase tracking-wider mb-2">
                Last Heartbeat
              </div>
              <div className="mono-data text-lg text-text-primary">
                {formatRelativeTime(bot.last_heartbeat)}
              </div>
            </div>

            <div className="panel">
              <div className="text-xs text-text-muted uppercase tracking-wider mb-2">
                Bot Type
              </div>
              <div className="mono-data text-lg text-text-primary capitalize">
                {bot.is_permanent ? 'permanent' : 'ephemeral'}
              </div>
            </div>

            <div className="panel">
              <div className="text-xs text-text-muted uppercase tracking-wider mb-2">
                Created At
              </div>
              <div className="mono-data text-sm text-text-primary">
                {formatRelativeTime(bot.created_at)}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="soul" className="space-y-4">
          <div className="panel">
            <div className="mono-data text-sm text-text-secondary space-y-4">
              <p># {bot.soul_name.toUpperCase()} SOUL</p>
              <p>You are a helpful AI assistant specialized in {bot.soul_name} tasks.</p>
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

        <TabsContent value="settings" className="space-y-4">
          <div className="panel space-y-6">
            {/* Provider Preset */}
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
                Provider Preset
              </label>
              <select
                value={settings.provider || ''}
                onChange={(e) => handleProviderChange(e.target.value)}
                disabled={loadingProviders}
                className="w-full bg-bg-surface border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-cyan"
              >
                <option value="">Select provider...</option>
                {providers.map((provider) => (
                  <option key={provider.name} value={provider.name}>
                    {provider.name} - {provider.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Model Name */}
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
                Model Name
              </label>
              <input
                type="text"
                value={settings.model || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, model: e.target.value }))}
                placeholder="e.g., gpt-4, claude-3-opus"
                className="w-full bg-bg-surface border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-cyan mono-data"
              />
            </div>

            {/* Client ID */}
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
                Client ID
              </label>
              <input
                type="text"
                value={settings.client_id || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, client_id: e.target.value }))}
                placeholder="e.g., telegram_user_123456"
                className="w-full bg-bg-surface border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-cyan mono-data"
              />
            </div>

            {/* Telegram Token */}
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
                Telegram Token
              </label>
              <input
                type="password"
                value={settings.telegram_token || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, telegram_token: e.target.value }))}
                placeholder="Bot token from @BotFather"
                className="w-full bg-bg-surface border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-cyan mono-data"
              />
            </div>

            {/* Telegram Allow From */}
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
                Telegram Allow From
              </label>
              <input
                type="text"
                value={settings.telegram_allow_from || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, telegram_allow_from: e.target.value }))}
                placeholder="Comma-separated user IDs"
                className="w-full bg-bg-surface border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-cyan mono-data"
              />
            </div>

            {/* Soul Template */}
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
                Soul Template
              </label>
              <select
                value={settings.soul_name || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, soul_name: e.target.value }))}
                disabled={loadingProviders}
                className="w-full bg-bg-surface border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-cyan"
              >
                <option value="">Select soul template...</option>
                {souls.map((soul) => (
                  <option key={soul.name} value={soul.name}>
                    {soul.name} - {soul.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Save Button */}
            <div className="pt-4">
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="
                  px-4 py-2 text-sm
                  bg-accent-cyan/20 border border-accent-cyan
                  text-accent-cyan
                  hover:bg-accent-cyan/30
                  transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tools" className="space-y-4">
          <div className="panel">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-text-muted uppercase tracking-wider">
                Available MCP Tools
              </div>
              <button
                onClick={loadTools}
                disabled={loadingTools}
                className="
                  px-3 py-1 text-xs
                  bg-bg-elevated border border-border
                  text-text-secondary
                  hover:text-text-primary hover:border-accent-cyan
                  transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {loadingTools ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {tools.length === 0 ? (
              <div className="text-sm text-text-muted">
                No tools loaded. Click Refresh to load available tools for this bot.
              </div>
            ) : (
              <div className="space-y-3">
                {tools.map((tool) => (
                  <div
                    key={`${tool.server}-${tool.name}`}
                    className="border border-border p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div className="mono-data text-sm text-text-primary">
                        {tool.name}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`
                          text-xs px-2 py-0.5 border
                          ${tool.scope === 'global' ? 'border-accent-cyan text-accent-cyan' : ''}
                          ${tool.scope === 'bot' ? 'border-accent-green text-accent-green' : ''}
                          ${tool.scope === 'session' ? 'border-status-idle text-status-idle' : ''}
                        `}>
                          {tool.scope}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-text-secondary">
                      {tool.description}
                    </div>
                    <div className="text-xs text-text-muted mono-data">
                      server: {tool.server}
                    </div>
                  </div>
                ))}
              </div>
            )}
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

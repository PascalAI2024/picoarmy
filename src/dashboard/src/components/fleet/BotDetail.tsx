import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { StatusLED } from '../ui/StatusLED';
import { LogStream } from '../telemetry/LogStream';
import { ActivityChart } from '../telemetry/ActivityChart';
import type { Bot, ProviderPreset, MCPTool, BotSettings, SoulTemplate } from '../../lib/types';
import { fetchProviders, fetchTools, updateBotSettings, fetchSouls, fetchSoulContent, deploySoul, callTool } from '../../lib/api';
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
  const [executingTool, setExecutingTool] = useState<string | null>(null);
  const [soulContent, setSoulContent] = useState<string | null>(null);
  const [loadingSoul, setLoadingSoul] = useState(false);
  const [deployingSoul, setDeployingSoul] = useState(false);
  const [selectedSoulToDeploy, setSelectedSoulToDeploy] = useState('');

  useEffect(() => {
    const loadData = async () => {
      setLoadingProviders(true);
      setLoadingSoul(true);
      try {
        const [providersData, soulsData, soulData] = await Promise.all([
          fetchProviders(),
          fetchSouls(),
          fetchSoulContent(bot.id).catch(() => null),
        ]);
        setProviders(providersData);
        setSouls(soulsData);
        if (soulData) setSoulContent(soulData.content);
      } catch (error) {
        console.error('Failed to load providers/souls:', error);
      } finally {
        setLoadingProviders(false);
        setLoadingSoul(false);
      }
    };
    loadData();
  }, [bot.id]);

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
      toast.success('Settings saved');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleExecuteTool = async (toolName: string) => {
    setExecutingTool(toolName);
    try {
      const result = await callTool(toolName, {}, bot.name);
      toast.success(`Tool "${toolName}" executed`);
      console.log('[Tool Result]', toolName, result);
    } catch (error) {
      console.error('Tool execution failed:', error);
      toast.error(`Tool "${toolName}" failed`);
    } finally {
      setExecutingTool(null);
    }
  };

  const handleDestroy = () => {
    if (window.confirm(`Destroy bot "${bot.name}"? This cannot be undone.`)) {
      onDestroy?.();
    }
  };

  const handleRestart = () => {
    if (window.confirm(`Restart bot "${bot.name}"?`)) {
      onRestart?.();
    }
  };

  const handleDeploySoul = async () => {
    if (!selectedSoulToDeploy) return;
    setDeployingSoul(true);
    try {
      await deploySoul(bot.id, selectedSoulToDeploy);
      toast.success(`Soul "${selectedSoulToDeploy}" deployed`);
      // Refresh soul content
      const soulData = await fetchSoulContent(bot.id);
      setSoulContent(soulData.content);
      setSelectedSoulToDeploy('');
    } catch (error) {
      console.error('Failed to deploy soul:', error);
      toast.error('Failed to deploy soul');
    } finally {
      setDeployingSoul(false);
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
          {/* Deploy soul control */}
          <div className="panel">
            <div className="flex items-center gap-3">
              <select
                value={selectedSoulToDeploy}
                onChange={(e) => setSelectedSoulToDeploy(e.target.value)}
                className="flex-1 bg-bg-surface border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-cyan"
              >
                <option value="">Select soul to deploy...</option>
                {souls.map((soul) => (
                  <option key={soul.name} value={soul.name}>
                    {soul.name} - {soul.description}
                  </option>
                ))}
              </select>
              <button
                onClick={handleDeploySoul}
                disabled={!selectedSoulToDeploy || deployingSoul}
                className="
                  px-4 py-2 text-sm
                  bg-accent-cyan/20 border border-accent-cyan
                  text-accent-cyan
                  hover:bg-accent-cyan/30
                  transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {deployingSoul ? 'Deploying...' : 'Deploy'}
              </button>
            </div>
          </div>

          {/* Soul content */}
          <div className="panel">
            <div className="text-xs text-text-muted uppercase tracking-wider mb-3">
              Current Soul: {bot.soul_name}
            </div>
            {loadingSoul ? (
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-bg-elevated rounded w-1/3" />
                <div className="h-3 bg-bg-elevated rounded w-full" />
                <div className="h-3 bg-bg-elevated rounded w-2/3" />
              </div>
            ) : soulContent ? (
              <pre className="mono-data text-sm text-text-secondary whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
                {soulContent}
              </pre>
            ) : (
              <p className="text-sm text-text-muted">No soul content available.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="skills" className="space-y-4">
          <div className="panel flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 mb-4 rounded-full bg-accent-cyan/10 border border-accent-cyan/30 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-accent-cyan"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h3 className="mono-data text-lg text-text-primary mb-2">No Skills Deployed</h3>
            <p className="text-sm text-text-secondary text-center max-w-md mb-1">
              Skills extend bot capabilities with custom commands and behaviors.
            </p>
            <p className="text-xs text-text-muted text-center max-w-md">
              Skills library coming soon — deploy pre-built skills or create your own.
            </p>
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
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 mb-4 rounded-full bg-accent-cyan/10 border border-accent-cyan/30 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-accent-cyan"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-text-secondary text-center">
                  Click <span className="text-accent-cyan">Refresh</span> to discover available MCP tools
                </p>
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
                        <button
                          onClick={() => handleExecuteTool(tool.name)}
                          disabled={executingTool === tool.name}
                          className="
                            px-2 py-0.5 text-xs
                            bg-accent-cyan/10 border border-accent-cyan/30
                            text-accent-cyan
                            hover:bg-accent-cyan/20
                            transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed
                          "
                        >
                          {executingTool === tool.name ? 'Running...' : 'Execute'}
                        </button>
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
          {/* Activity Chart */}
          <ActivityChart height={250} timeWindow={60} />

          {/* Log Stream */}
          <LogStream maxLines={500} height="400px" />
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          <div className="flex gap-3">
            <button
              onClick={handleRestart}
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
              onClick={handleDestroy}
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

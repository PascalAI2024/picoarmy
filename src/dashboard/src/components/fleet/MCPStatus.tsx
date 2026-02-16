import { useState, useEffect } from 'react';
import { StatusLED } from '../ui/StatusLED';
import { fetchMCPStatus } from '../../lib/api';
import type { MCPHubStatus } from '../../lib/types';

export function MCPStatus() {
  const [status, setStatus] = useState<MCPHubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMCPStatus();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MCP status');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="panel">
        <div className="flex items-center justify-between mb-3">
          <span className="mono-data text-xs text-text-muted uppercase tracking-wider">
            MCP HUB STATUS
          </span>
        </div>
        <div className="text-sm text-text-muted text-center py-4">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel">
        <div className="flex items-center justify-between mb-3">
          <span className="mono-data text-xs text-text-muted uppercase tracking-wider">
            MCP HUB STATUS
          </span>
          <button
            onClick={loadStatus}
            className="text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors"
          >
            Retry
          </button>
        </div>
        <div className="text-sm text-status-offline">{error}</div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-border">
        <span className="mono-data text-xs text-text-muted uppercase tracking-wider">
          MCP HUB STATUS
        </span>
        <button
          onClick={loadStatus}
          className="text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors"
        >
          Refresh
        </button>
      </div>

      {status && status.servers.length === 0 ? (
        <div className="text-sm text-text-muted text-center py-4">
          No MCP servers connected
        </div>
      ) : (
        <div className="space-y-3">
          {status?.servers.map((server) => (
            <div
              key={server.name}
              className="flex items-start justify-between gap-3 pb-3 border-b border-border last:border-0 last:pb-0"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <StatusLED
                    status={server.status === 'connected' ? 'online' : 'offline'}
                    size="sm"
                  />
                  <span className="mono-data text-sm text-text-primary truncate">
                    {server.name}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mb-1">{server.description}</p>
                {server.error && (
                  <p className="text-xs text-status-offline">{server.error}</p>
                )}
              </div>

              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-xs text-text-muted mono-data">
                  {server.toolCount} tools
                </span>
                <span
                  className={`
                    text-xs px-1.5 py-0.5 border rounded-sm
                    ${server.scope === 'global' ? 'border-accent-cyan text-accent-cyan bg-accent-cyan/10' : ''}
                    ${server.scope === 'bot' ? 'border-accent-green text-accent-green bg-accent-green/10' : ''}
                    ${server.scope === 'session' ? 'border-status-idle text-status-idle bg-status-idle/10' : ''}
                  `}
                >
                  {server.scope}
                </span>
              </div>
            </div>
          ))}

          <div className="pt-2 mt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">Total Tools</span>
              <span className="mono-data text-sm text-accent-cyan font-semibold">
                {status?.totalTools || 0}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

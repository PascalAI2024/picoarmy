import { useState, useEffect } from 'react';
import type { MCPTool, MCPHubStatus } from '../lib/types';
import { fetchTools, fetchMCPStatus } from '../lib/api';

export function SkillsPage() {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [status, setStatus] = useState<MCPHubStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [toolsData, statusData] = await Promise.all([
          fetchTools(),
          fetchMCPStatus(),
        ]);
        setTools(toolsData);
        setStatus(statusData);
      } catch (error) {
        console.error('Failed to load skills/MCP status:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Group tools by server
  const toolsByServer = tools.reduce((acc, tool) => {
    if (!acc[tool.server]) {
      acc[tool.server] = [];
    }
    acc[tool.server].push(tool);
    return acc;
  }, {} as Record<string, MCPTool[]>);

  const getServerStatus = (serverName: string) => {
    return status?.servers.find(s => s.name === serverName);
  };

  const formatInputSchema = (schema: Record<string, unknown>): string => {
    if (!schema || typeof schema !== 'object') return 'No parameters';

    const properties = (schema as any).properties;
    if (!properties || typeof properties !== 'object') return 'No parameters';

    const params = Object.keys(properties);
    if (params.length === 0) return 'No parameters';

    return params.join(', ');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Skills Library
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            MCP tools available across the fleet
          </p>
        </div>
        {status && (
          <div className="text-sm text-text-secondary">
            {status.totalTools} tool{status.totalTools !== 1 ? 's' : ''} from{' '}
            {status.servers.length} server{status.servers.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {loading ? (
        <div className="panel text-center py-12">
          <p className="text-text-muted">Loading skills...</p>
        </div>
      ) : tools.length === 0 ? (
        <div className="panel text-center py-12 space-y-3">
          <p className="text-text-muted">No MCP tools available.</p>
          <p className="text-sm text-text-secondary">
            Configure MCP servers in your bots to see available skills here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(toolsByServer).map(([serverName, serverTools]) => {
            const serverStatus = getServerStatus(serverName);
            const isConnected = serverStatus?.status === 'connected';

            return (
              <div key={serverName} className="space-y-3">
                {/* Server Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-medium text-text-primary">
                      {serverName}
                    </h2>
                    <span
                      className={`
                        inline-flex items-center gap-2
                        px-2 py-1 text-xs font-medium
                        border rounded
                        ${isConnected
                          ? 'bg-status-online/20 border-status-online text-status-online'
                          : 'bg-status-offline/20 border-status-offline text-status-offline'
                        }
                      `}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-status-online' : 'bg-status-offline'}`} />
                      {serverStatus?.status || 'unknown'}
                    </span>
                  </div>
                  <div className="text-sm text-text-muted">
                    {serverTools.length} tool{serverTools.length !== 1 ? 's' : ''}
                  </div>
                </div>

                {serverStatus?.description && (
                  <p className="text-sm text-text-secondary">
                    {serverStatus.description}
                  </p>
                )}

                {serverStatus?.error && (
                  <div className="panel bg-status-offline/10 border-status-offline">
                    <p className="text-sm text-status-offline">
                      <strong>Error:</strong> {serverStatus.error}
                    </p>
                  </div>
                )}

                {/* Tools Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {serverTools.map((tool) => (
                    <div
                      key={`${tool.server}-${tool.name}`}
                      className="
                        panel
                        hover:border-border-hover
                        transition-colors
                      "
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="mono-data font-semibold text-sm text-text-primary">
                            {tool.name}
                          </h3>
                          <span className="text-xs text-text-muted bg-bg-elevated px-2 py-0.5 rounded">
                            {tool.scope}
                          </span>
                        </div>

                        <p className="text-sm text-text-secondary line-clamp-3">
                          {tool.description}
                        </p>

                        <div className="pt-2 border-t border-border">
                          <p className="text-xs text-text-muted">
                            <strong>Parameters:</strong>{' '}
                            {formatInputSchema(tool.inputSchema)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

// ── Types ────────────────────────────────────────────────────────

export interface MCPServerConfig {
  // Stdio transport (spawn a process)
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // HTTP transport (connect to remote URL)
  type?: 'stdio' | 'http';
  url?: string;
  headers?: Record<string, string>;
  // Common
  scope: string; // 'shared' or 'client:<id>'
  description: string;
}

export interface MCPServersFile {
  servers: Record<string, MCPServerConfig>;
  scoping?: Record<string, string>;
}

export interface MCPToolInfo {
  name: string;
  description: string;
  server: string;
  scope: string;
  inputSchema: Record<string, unknown>;
}

interface MCPConnection {
  client: Client;
  transport: StdioClientTransport | StreamableHTTPClientTransport;
  config: MCPServerConfig;
  tools: MCPToolInfo[];
  status: 'connecting' | 'connected' | 'error' | 'disconnected';
  error?: string;
}

export interface MCPToolCallResult {
  content: Array<{ type: string; text?: string | undefined; data?: string | undefined; mimeType?: string | undefined }>;
  isError?: boolean | undefined;
}

export interface MCPHubStatus {
  servers: Array<{
    name: string;
    status: string;
    toolCount: number;
    scope: string;
    description: string;
    error?: string | undefined;
  }>;
  totalTools: number;
}

// ── MCP Hub ──────────────────────────────────────────────────────

export class MCPHub extends EventEmitter {
  private connections: Map<string, MCPConnection> = new Map();
  private configPath: string;

  constructor(configPath?: string) {
    super();
    this.configPath = configPath || path.join(process.cwd(), 'mcp-servers.json');
  }

  // ── Lifecycle ────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (!fs.existsSync(this.configPath)) {
      console.log('[MCP] No mcp-servers.json found — hub inactive');
      return;
    }

    const raw = fs.readFileSync(this.configPath, 'utf-8');
    const config: MCPServersFile = JSON.parse(raw);

    console.log(`[MCP] Initializing hub with ${Object.keys(config.servers).length} server(s)`);

    // Connect to each server (don't fail if one server fails)
    const results = await Promise.allSettled(
      Object.entries(config.servers).map(([name, serverConfig]) =>
        this.connectServer(name, serverConfig)
      )
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[MCP] Server connection failed:', result.reason);
      }
    }

    const connected = Array.from(this.connections.values()).filter(c => c.status === 'connected');
    const totalTools = connected.reduce((sum, c) => sum + c.tools.length, 0);
    console.log(`[MCP] Hub ready — ${connected.length} server(s), ${totalTools} tool(s)`);
  }

  async connectServer(name: string, config: MCPServerConfig): Promise<void> {
    const isHttp = config.type === 'http' || !!config.url;
    const displayInfo = isHttp ? config.url : `${config.command} ${(config.args || []).join(' ')}`;
    console.log(`[MCP] Connecting to "${name}" (${isHttp ? 'HTTP' : 'stdio'}: ${displayInfo})`);

    const conn: MCPConnection = {
      client: new Client({ name: 'picoarmy-commander', version: '1.0.0' }),
      transport: null!,
      config,
      tools: [],
      status: 'connecting',
    };

    this.connections.set(name, conn);

    try {
      // Interpolate env vars in all string values: ${VAR_NAME} → process.env.VAR_NAME
      const interpolate = (val: string) =>
        val.replace(/\$\{(\w+)\}/g, (_, varName) => process.env[varName] || '');

      if (isHttp && config.url) {
        // HTTP transport
        const headers: Record<string, string> = {
          // Z.AI Streamable HTTP MCP requires both Accept types
          'Accept': 'application/json, text/event-stream',
        };
        if (config.headers) {
          for (const [key, value] of Object.entries(config.headers)) {
            headers[key] = interpolate(value);
          }
        }

        // Skip servers with missing API keys (interpolated to empty string)
        const authHeader = headers['Authorization'];
        if (authHeader && authHeader.endsWith('Bearer ')) {
          console.log(`[MCP] Skipping "${name}" — API key not configured`);
          conn.status = 'disconnected';
          conn.error = 'API key not configured';
          return;
        }

        conn.transport = new StreamableHTTPClientTransport(
          new URL(config.url),
          { requestInit: { headers } }
        );
      } else if (config.command) {
        // Stdio transport
        const env: Record<string, string> = {};
        if (config.env) {
          for (const [key, value] of Object.entries(config.env)) {
            env[key] = interpolate(value);
          }
        }

        conn.transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: { ...process.env as Record<string, string>, ...env },
        });
      } else {
        throw new Error(`Server "${name}" has no command or url configured`);
      }

      await conn.client.connect(conn.transport as Transport);
      conn.status = 'connected';

      // Discover tools
      const toolsResult = await conn.client.listTools();
      conn.tools = toolsResult.tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        server: name,
        scope: config.scope,
        inputSchema: tool.inputSchema as Record<string, unknown>,
      }));

      console.log(`[MCP] "${name}" connected — ${conn.tools.length} tool(s): ${conn.tools.map(t => t.name).join(', ')}`);
      this.emit('server:connected', { name, toolCount: conn.tools.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      conn.status = 'error';
      conn.error = message;
      console.error(`[MCP] Failed to connect "${name}":`, message);
      this.emit('server:error', { name, error: message });
    }
  }

  async shutdown(): Promise<void> {
    console.log('[MCP] Shutting down hub...');
    for (const [name, conn] of this.connections) {
      try {
        await conn.transport?.close();
        console.log(`[MCP] Disconnected "${name}"`);
      } catch (err) {
        console.error(`[MCP] Error disconnecting "${name}":`, err);
      }
    }
    this.connections.clear();
  }

  // ── Discovery ────────────────────────────────────────────────

  listTools(clientId?: string): MCPToolInfo[] {
    const tools: MCPToolInfo[] = [];
    for (const conn of this.connections.values()) {
      if (conn.status !== 'connected') continue;
      for (const tool of conn.tools) {
        if (this.checkScope(conn.config.scope, clientId)) {
          tools.push(tool);
        }
      }
    }
    return tools;
  }

  getTool(toolName: string): MCPToolInfo | undefined {
    for (const conn of this.connections.values()) {
      const tool = conn.tools.find(t => t.name === toolName);
      if (tool) return tool;
    }
    return undefined;
  }

  // ── Execution ────────────────────────────────────────────────

  async callTool(params: {
    toolName: string;
    arguments: Record<string, unknown>;
    botName: string;
    clientId?: string | undefined;
  }): Promise<MCPToolCallResult> {
    const { toolName, arguments: args, botName, clientId } = params;

    // Find which server owns this tool
    let targetConn: MCPConnection | undefined;
    for (const conn of this.connections.values()) {
      if (conn.tools.find(t => t.name === toolName)) {
        targetConn = conn;
        break;
      }
    }

    if (!targetConn) {
      throw new Error(`Tool "${toolName}" not found in any connected server`);
    }

    // Scope check
    if (!this.checkScope(targetConn.config.scope, clientId)) {
      this.emit('tool:denied', { toolName, botName, clientId, scope: targetConn.config.scope });
      throw new Error(
        `Access denied: bot "${botName}" (client: ${clientId || 'none'}) cannot use tool "${toolName}" (scope: ${targetConn.config.scope})`
      );
    }

    const startTime = Date.now();

    try {
      const result = await targetConn.client.callTool({ name: toolName, arguments: args });
      const durationMs = Date.now() - startTime;

      // Normalize result content
      const content = Array.isArray(result.content)
        ? result.content.map((c: Record<string, unknown>) => ({
            type: String(c.type || 'text'),
            text: c.text ? String(c.text) : undefined,
            data: c.data ? String(c.data) : undefined,
            mimeType: c.mimeType ? String(c.mimeType) : undefined,
          }))
        : [{ type: 'text', text: JSON.stringify(result) }];

      const toolResult: MCPToolCallResult = {
        content,
        isError: 'isError' in result ? Boolean(result.isError) : false,
      };

      this.emit('tool:called', {
        toolName,
        botName,
        clientId,
        durationMs,
        isError: toolResult.isError,
      });

      return toolResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - startTime;

      this.emit('tool:error', { toolName, botName, clientId, error: message, durationMs });
      throw err;
    }
  }

  // ── Scope Enforcement ────────────────────────────────────────

  private checkScope(serverScope: string, clientId?: string): boolean {
    // Shared tools are available to everyone
    if (serverScope === 'shared') return true;

    // Client-scoped: "client:acme" only matches clientId "acme"
    if (serverScope.startsWith('client:')) {
      const requiredClient = serverScope.slice('client:'.length);
      return clientId === requiredClient;
    }

    // Unknown scope — deny by default
    return false;
  }

  // ── Status ───────────────────────────────────────────────────

  getStatus(): MCPHubStatus {
    const servers = Array.from(this.connections.entries()).map(([name, conn]) => ({
      name,
      status: conn.status,
      toolCount: conn.tools.length,
      scope: conn.config.scope,
      description: conn.config.description,
      error: conn.error,
    }));

    const totalTools = servers.reduce((sum, s) => sum + s.toolCount, 0);
    return { servers, totalTools };
  }
}

// Singleton
export const mcpHub = new MCPHub();

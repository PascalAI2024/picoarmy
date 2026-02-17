// Shared TypeScript types for PicoArmy Dashboard

export interface Bot {
  id: string;
  name: string;
  soul_name: string;
  status: 'online' | 'idle' | 'offline' | 'spawning';
  last_heartbeat: string;
  created_at: string;
  is_permanent: boolean;
  ttl_seconds: number | null;
  memory_mb?: number;
  uptime_seconds?: number;
  client_id?: string;
  metadata?: Record<string, unknown>;
}

export interface LogEntry {
  id: string;
  bot_id?: string;
  bot_name?: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface CreateBotData {
  name: string;
  soul_name: string;
  is_permanent: boolean;
  ttl_seconds?: number;
  provider?: string;
  model?: string;
}

export interface SoulTemplate {
  name: string;
  description: string;
}

export interface Skill {
  name: string;
  description: string;
  content?: string;
}

export interface ProviderPreset {
  name: string;
  model: string;
  format: 'openai' | 'anthropic';
  description: string;
  configured: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  server: string;
  scope: string;
  inputSchema: Record<string, unknown>;
}

export interface BotSettings {
  provider?: string;
  model?: string;
  client_id?: string;
  telegram_token?: string;
  telegram_allow_from?: string;
  soul_name?: string;
}

export interface MCPHubStatus {
  servers: Array<{
    name: string;
    status: string;
    toolCount: number;
    scope: string;
    description: string;
    error?: string;
  }>;
  totalTools: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface ChatResponse {
  reply: string;
  model: string;
  provider: string;
}

// Commander Chat types
export interface CommanderToolCall {
  tool: string;
  args: Record<string, unknown>;
  result: string;
}

export interface CommanderChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: CommanderToolCall[];
  timestamp?: string;
}

export interface CommanderChatResponse {
  reply: string;
  toolCalls: CommanderToolCall[];
  model: string;
  provider: string;
}

// SSE Event types
export type SSEEvent =
  | { type: 'fleet:update'; data: Bot[] }
  | { type: 'fleet:spawn'; data: Bot }
  | { type: 'fleet:destroy'; data: { id: string } }
  | { type: 'log:entry'; data: LogEntry }
  | { type: 'connected'; data: { clientId: string } };

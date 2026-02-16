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
}

export interface LogEntry {
  id: string;
  bot_id: string;
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
}

export interface SoulTemplate {
  name: string;
  description: string;
}

// SSE Event types
export type SSEEvent =
  | { type: 'fleet:update'; data: Bot[] }
  | { type: 'fleet:spawn'; data: Bot }
  | { type: 'fleet:destroy'; data: { id: string } }
  | { type: 'log:entry'; data: LogEntry }
  | { type: 'connected'; data: { clientId: string } };

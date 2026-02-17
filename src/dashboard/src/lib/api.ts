// API client for Commander REST endpoints

import type { Bot, CreateBotData, LogEntry, SoulTemplate, ProviderPreset, MCPTool, BotSettings, MCPHubStatus, ChatMessage, ChatResponse } from './types';

// Base URL for API (same origin in production, or from env in dev)
const API_BASE = import.meta.env.VITE_API_URL || '';

interface ApiError {
  error: string;
  message?: string;
}

// Generic fetch wrapper with error handling
async function fetchJSON<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      error: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new Error(error.error || error.message || 'API request failed');
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// Fleet API
export async function fetchFleet(): Promise<Bot[]> {
  return fetchJSON<Bot[]>('/api/fleet');
}

export async function fetchBot(id: string): Promise<Bot> {
  return fetchJSON<Bot>(`/api/fleet/${id}`);
}

export async function createBot(data: CreateBotData): Promise<Bot> {
  return fetchJSON<Bot>('/api/fleet', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteBot(id: string): Promise<void> {
  return fetchJSON<void>(`/api/fleet/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchBotLogs(
  botId: string,
  limit = 100
): Promise<LogEntry[]> {
  return fetchJSON<LogEntry[]>(`/api/fleet/${botId}/logs?limit=${limit}`);
}

// Soul API
export async function fetchSoulContent(botId: string): Promise<{ content: string; soul_name: string }> {
  return fetchJSON(`/api/fleet/${botId}/soul`);
}

export async function fetchSouls(): Promise<SoulTemplate[]> {
  return fetchJSON<SoulTemplate[]>('/api/souls');
}

export async function deploySoul(
  botId: string,
  soulName: string
): Promise<{ success: boolean; bot_id: string; soul_name: string }> {
  return fetchJSON(`/api/fleet/${botId}/soul`, {
    method: 'POST',
    body: JSON.stringify({ soul_name: soulName }),
  });
}

// Provider API
export async function fetchProviders(): Promise<ProviderPreset[]> {
  return fetchJSON<ProviderPreset[]>('/api/providers');
}

// Tools API
export async function fetchTools(botName?: string): Promise<MCPTool[]> {
  const query = botName ? `?bot=${encodeURIComponent(botName)}` : '';
  return fetchJSON<MCPTool[]>(`/api/tools${query}`);
}

export async function callTool(toolName: string, args: Record<string, unknown>, botName: string): Promise<unknown> {
  return fetchJSON(`/api/tools/${encodeURIComponent(toolName)}/call`, {
    method: 'POST',
    body: JSON.stringify({ arguments: args, bot_name: botName }),
  });
}

export async function fetchMCPStatus(): Promise<MCPHubStatus> {
  return fetchJSON<MCPHubStatus>('/api/mcp/status');
}

// Chat API
export async function chatWithBot(
  botId: string,
  message: string,
  history: ChatMessage[] = []
): Promise<ChatResponse> {
  return fetchJSON<ChatResponse>(`/api/fleet/${botId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message, history }),
  });
}

// Settings API
export async function updateBotSettings(id: string, settings: BotSettings): Promise<Bot> {
  return fetchJSON<Bot>(`/api/fleet/${id}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export default {
  fetchFleet,
  fetchBot,
  createBot,
  deleteBot,
  fetchBotLogs,
  fetchSoulContent,
  fetchSouls,
  deploySoul,
  fetchProviders,
  fetchTools,
  callTool,
  fetchMCPStatus,
  updateBotSettings,
  chatWithBot,
};

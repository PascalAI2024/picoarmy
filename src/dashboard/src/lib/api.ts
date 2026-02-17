// API client for Commander REST endpoints

import type { Bot, CreateBotData, LogEntry, SoulTemplate, ProviderPreset, MCPTool, BotSettings, MCPHubStatus, ChatMessage, ChatResponse, Skill, CommanderChatMessage, CommanderChatResponse } from './types';

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

export async function restartBot(id: string): Promise<{ success: boolean; bot_id: string }> {
  return fetchJSON(`/api/fleet/${id}/restart`, {
    method: 'POST',
  });
}

export async function fetchBotLogs(
  botId: string,
  limit = 100
): Promise<LogEntry[]> {
  return fetchJSON<LogEntry[]>(`/api/fleet/${botId}/logs?limit=${limit}`);
}

export async function fetchGlobalLogs(
  limit = 100,
  level?: string,
  bot?: string
): Promise<LogEntry[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (level) params.set('level', level);
  if (bot) params.set('bot', bot);
  return fetchJSON<LogEntry[]>(`/api/logs?${params.toString()}`);
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

export async function createSoul(name: string, content: string): Promise<SoulTemplate> {
  return fetchJSON('/api/souls', {
    method: 'POST',
    body: JSON.stringify({ name, content }),
  });
}

export async function updateSoul(name: string, content: string): Promise<SoulTemplate> {
  return fetchJSON(`/api/souls/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export async function deleteSoul(name: string): Promise<void> {
  return fetchJSON(`/api/souls/${encodeURIComponent(name)}`, {
    method: 'DELETE',
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

// Skills API
export async function fetchSkills(): Promise<Skill[]> {
  return fetchJSON<Skill[]>('/api/skills');
}

export async function fetchSkillDetail(name: string): Promise<Skill> {
  return fetchJSON<Skill>(`/api/skills/${encodeURIComponent(name)}`);
}

export async function fetchBotSkills(botId: string): Promise<Skill[]> {
  return fetchJSON<Skill[]>(`/api/fleet/${botId}/skills`);
}

export async function deploySkill(
  botId: string,
  skillName: string
): Promise<{ success: boolean; bot_id: string; skill_name: string }> {
  return fetchJSON(`/api/fleet/${botId}/skills`, {
    method: 'POST',
    body: JSON.stringify({ skill_name: skillName }),
  });
}

export async function removeSkill(botId: string, skillName: string): Promise<void> {
  return fetchJSON<void>(`/api/fleet/${botId}/skills/${encodeURIComponent(skillName)}`, {
    method: 'DELETE',
  });
}

// Commander Chat API
export async function chatWithCommander(
  message: string,
  history: CommanderChatMessage[] = []
): Promise<CommanderChatResponse> {
  return fetchJSON<CommanderChatResponse>('/api/commander/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history: history.map(m => ({ role: m.role, content: m.content })) }),
  });
}

export default {
  fetchFleet,
  fetchBot,
  createBot,
  deleteBot,
  restartBot,
  fetchBotLogs,
  fetchGlobalLogs,
  fetchSoulContent,
  fetchSouls,
  deploySoul,
  createSoul,
  updateSoul,
  deleteSoul,
  fetchProviders,
  fetchTools,
  callTool,
  fetchMCPStatus,
  updateBotSettings,
  chatWithBot,
  fetchSkills,
  fetchSkillDetail,
  fetchBotSkills,
  deploySkill,
  removeSkill,
  chatWithCommander,
};

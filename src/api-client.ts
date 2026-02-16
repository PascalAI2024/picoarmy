import axios, { type AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const POSTGREST_URL = process.env.POSTGREST_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.PGRST_JWT_SECRET || '';

// PostgREST API client
const apiClient: AxiosInstance = axios.create({
  baseURL: POSTGREST_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 5000,
});

// Bot type
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

export interface TelemetryEntry {
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

// Mock data for development without PostgREST
const MOCK_BOTS: Bot[] = [
  {
    id: 'mock-1',
    name: 'mom-helper',
    soul_name: 'assistant',
    status: 'online' as const,
    last_heartbeat: new Date().toISOString(),
    created_at: new Date(Date.now() - 86400000).toISOString(),
    is_permanent: true,
    ttl_seconds: null,
  },
  {
    id: 'mock-2',
    name: 'seo-acme',
    soul_name: 'seo-writer',
    status: 'online' as const,
    last_heartbeat: new Date(Date.now() - 120000).toISOString(),
    created_at: new Date(Date.now() - 3600000).toISOString(),
    is_permanent: true,
    ttl_seconds: null,
  },
  {
    id: 'mock-3',
    name: 'task-runner-1',
    soul_name: 'assistant',
    status: 'idle' as const,
    last_heartbeat: new Date(Date.now() - 180000).toISOString(),
    created_at: new Date(Date.now() - 7200000).toISOString(),
    is_permanent: false,
    ttl_seconds: 7200,
  },
];

// Compute bot status from last_heartbeat
function computeStatus(lastHeartbeat: string): Bot['status'] {
  const heartbeatTime = new Date(lastHeartbeat).getTime();
  const now = Date.now();
  const diffSeconds = (now - heartbeatTime) / 1000;

  if (diffSeconds < 120) return 'online'; // heartbeat within 2min
  if (diffSeconds < 300) return 'idle'; // heartbeat within 5min
  return 'offline'; // no heartbeat for 5+ min
}

// Enrich bot with computed status and uptime
function enrichBot(bot: Bot): Bot {
  const status = computeStatus(bot.last_heartbeat);
  const uptimeSeconds = Math.floor(
    (Date.now() - new Date(bot.created_at).getTime()) / 1000
  );

  return {
    ...bot,
    status,
    uptime_seconds: uptimeSeconds,
    memory_mb: bot.memory_mb || Math.floor(Math.random() * 30 + 10), // mock memory
  };
}

// API Client Methods
export async function getBots(): Promise<Bot[]> {
  try {
    const response = await apiClient.get('/bots');
    return response.data.map(enrichBot);
  } catch (error) {
    console.warn('PostgREST unavailable, using mock data:', error);
    return MOCK_BOTS.map(enrichBot);
  }
}

export async function getBot(id: string): Promise<Bot | null> {
  try {
    const response = await apiClient.get(`/bots?id=eq.${id}`);
    if (response.data.length === 0) return null;
    return enrichBot(response.data[0]);
  } catch (error) {
    console.warn('PostgREST unavailable, using mock data:', error);
    const mockBot = MOCK_BOTS.find((b) => b.id === id);
    return mockBot ? enrichBot(mockBot) : null;
  }
}

export async function createBot(data: CreateBotData): Promise<Bot> {
  try {
    const response = await apiClient.post('/bots', data, {
      headers: { Prefer: 'return=representation' },
    });
    return enrichBot(response.data[0]);
  } catch (error) {
    console.warn('PostgREST unavailable, returning mock bot:', error);
    // Return mock created bot
    const mockBot: Bot = {
      id: `mock-${Date.now()}`,
      name: data.name,
      soul_name: data.soul_name,
      status: 'spawning',
      last_heartbeat: new Date().toISOString(),
      created_at: new Date().toISOString(),
      is_permanent: data.is_permanent,
      ttl_seconds: data.ttl_seconds || null,
    };
    return enrichBot(mockBot);
  }
}

export async function deleteBot(id: string): Promise<void> {
  try {
    await apiClient.delete(`/bots?id=eq.${id}`);
  } catch (error) {
    console.warn('PostgREST unavailable, delete ignored:', error);
  }
}

export async function getTelemetry(
  botId: string,
  limit = 100
): Promise<TelemetryEntry[]> {
  try {
    const response = await apiClient.get(
      `/telemetry?bot_id=eq.${botId}&order=timestamp.desc&limit=${limit}`,
      { headers: { Accept: 'application/json' } }
    );
    return response.data;
  } catch (error) {
    console.warn('PostgREST unavailable, returning mock telemetry:', error);
    // Return mock telemetry
    return [
      {
        id: 'tel-1',
        bot_id: botId,
        level: 'info',
        message: 'Heartbeat OK',
        metadata: {},
        timestamp: new Date(Date.now() - 10000).toISOString(),
      },
      {
        id: 'tel-2',
        bot_id: botId,
        level: 'info',
        message: 'Processing task',
        metadata: { task_id: '123' },
        timestamp: new Date(Date.now() - 60000).toISOString(),
      },
    ];
  }
}

export default {
  getBots,
  getBot,
  createBot,
  deleteBot,
  getTelemetry,
};

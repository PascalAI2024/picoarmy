export interface Bot {
  id: string;
  name: string;
  status: 'online' | 'idle' | 'offline' | 'spawning';
  type: 'permanent' | 'ephemeral';
  soul: string;
  uptime: string;
  memory: string;
  lastHeartbeat: string;
  pid?: number;
  ttl?: string;
}

export const mockBots: Bot[] = [
  {
    id: '1',
    name: 'mom-helper',
    status: 'online',
    type: 'permanent',
    soul: 'assistant',
    uptime: '5d 14h 23m',
    memory: '24.3 MB',
    lastHeartbeat: '2s ago',
    pid: 12453,
  },
  {
    id: '2',
    name: 'seo-acme',
    status: 'online',
    type: 'permanent',
    soul: 'seo-writer',
    uptime: '2d 8h 45m',
    memory: '31.7 MB',
    lastHeartbeat: '1s ago',
    pid: 12481,
  },
  {
    id: '3',
    name: 'support-bot',
    status: 'idle',
    type: 'permanent',
    soul: 'support-agent',
    uptime: '12h 5m',
    memory: '18.9 MB',
    lastHeartbeat: '45s ago',
    pid: 13021,
  },
  {
    id: '4',
    name: 'researcher-1',
    status: 'spawning',
    type: 'ephemeral',
    soul: 'researcher',
    uptime: '0m',
    memory: '8.1 MB',
    lastHeartbeat: 'never',
    ttl: '2h',
  },
  {
    id: '5',
    name: 'content-gen-3',
    status: 'online',
    type: 'ephemeral',
    soul: 'content-writer',
    uptime: '45m',
    memory: '28.4 MB',
    lastHeartbeat: '3s ago',
    pid: 14120,
    ttl: '1h 15m',
  },
  {
    id: '6',
    name: 'task-runner-7',
    status: 'offline',
    type: 'ephemeral',
    soul: 'assistant',
    uptime: '0m',
    memory: '0 MB',
    lastHeartbeat: '5m ago',
    ttl: 'expired',
  },
  {
    id: '7',
    name: 'analytics-bot',
    status: 'online',
    type: 'permanent',
    soul: 'analyst',
    uptime: '9d 2h 11m',
    memory: '42.1 MB',
    lastHeartbeat: '2s ago',
    pid: 11832,
  },
  {
    id: '8',
    name: 'qa-tester',
    status: 'idle',
    type: 'ephemeral',
    soul: 'tester',
    uptime: '1h 23m',
    memory: '21.3 MB',
    lastHeartbeat: '1m ago',
    pid: 14205,
    ttl: '3h 37m',
  },
];

export const mockSoulTemplates = [
  'assistant',
  'seo-writer',
  'support-agent',
  'researcher',
  'content-writer',
  'analyst',
  'tester',
];

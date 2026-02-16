// Telemetry/log state store using Zustand

import { create } from 'zustand';
import type { LogEntry } from '../lib/types';

interface TelemetryStore {
  // State
  logs: LogEntry[];
  maxLogs: number;

  // Actions
  addLog: (entry: LogEntry) => void;
  addLogs: (entries: LogEntry[]) => void;
  clearLogs: () => void;
  setMaxLogs: (max: number) => void;

  // Computed
  recentLogs: (count?: number) => LogEntry[];
  logsByBot: (botId: string) => LogEntry[];
}

export const useTelemetryStore = create<TelemetryStore>((set, get) => ({
  // Initial state
  logs: [],
  maxLogs: 500, // Keep last 500 logs in memory

  // Actions
  addLog: (entry) =>
    set((state) => {
      const newLogs = [...state.logs, entry];
      // Keep only maxLogs most recent entries
      if (newLogs.length > state.maxLogs) {
        return { logs: newLogs.slice(-state.maxLogs) };
      }
      return { logs: newLogs };
    }),

  addLogs: (entries) =>
    set((state) => {
      const newLogs = [...state.logs, ...entries];
      // Sort by timestamp descending (newest first)
      newLogs.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      // Keep only maxLogs most recent entries
      if (newLogs.length > state.maxLogs) {
        return { logs: newLogs.slice(0, state.maxLogs) };
      }
      return { logs: newLogs };
    }),

  clearLogs: () => set({ logs: [] }),

  setMaxLogs: (max) => set({ maxLogs: max }),

  // Computed selectors
  recentLogs: (count = 100) => {
    const { logs } = get();
    return logs.slice(0, count);
  },

  logsByBot: (botId) => {
    const { logs } = get();
    return logs.filter((log) => log.bot_id === botId);
  },
}));

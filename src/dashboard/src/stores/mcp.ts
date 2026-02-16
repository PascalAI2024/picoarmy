// MCP event store using Zustand

import { create } from 'zustand';

export interface MCPEvent {
  id: string;
  type: 'tool-called' | 'tool-error' | 'tool-denied' | 'server-connected' | 'server-error';
  timestamp: string;
  data: Record<string, unknown>;
}

interface MCPStore {
  events: MCPEvent[];
  maxEvents: number;

  addEvent: (event: MCPEvent) => void;
  clearEvents: () => void;

  recentEvents: (count?: number) => MCPEvent[];
}

export const useMCPStore = create<MCPStore>((set, get) => ({
  events: [],
  maxEvents: 200,

  addEvent: (event) =>
    set((state) => {
      const newEvents = [event, ...state.events];
      if (newEvents.length > state.maxEvents) {
        return { events: newEvents.slice(0, state.maxEvents) };
      }
      return { events: newEvents };
    }),

  clearEvents: () => set({ events: [] }),

  recentEvents: (count = 50) => {
    const { events } = get();
    return events.slice(0, count);
  },
}));

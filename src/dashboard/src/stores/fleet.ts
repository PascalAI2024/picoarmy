// Fleet state store using Zustand

import { create } from 'zustand';
import type { Bot } from '../lib/types';

type FilterType = 'all' | 'online' | 'idle' | 'offline';

interface FleetStore {
  // State
  bots: Bot[];
  selectedBotId: string | null;
  filter: FilterType;
  loading: boolean;
  error: string | null;

  // Actions
  setBots: (bots: Bot[]) => void;
  updateBot: (id: string, updates: Partial<Bot>) => void;
  addBot: (bot: Bot) => void;
  removeBot: (id: string) => void;
  selectBot: (id: string | null) => void;
  setFilter: (filter: FilterType) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Computed selectors
  filteredBots: () => Bot[];
  stats: () => { online: number; idle: number; offline: number; total: number };
  selectedBot: () => Bot | null;
}

export const useFleetStore = create<FleetStore>((set, get) => ({
  // Initial state
  bots: [],
  selectedBotId: null,
  filter: 'all',
  loading: false,
  error: null,

  // Actions
  setBots: (bots) => set({ bots }),

  updateBot: (id, updates) =>
    set((state) => ({
      bots: state.bots.map((bot) => (bot.id === id ? { ...bot, ...updates } : bot)),
    })),

  addBot: (bot) =>
    set((state) => ({
      bots: [...state.bots, bot],
    })),

  removeBot: (id) =>
    set((state) => ({
      bots: state.bots.filter((bot) => bot.id !== id),
      selectedBotId: state.selectedBotId === id ? null : state.selectedBotId,
    })),

  selectBot: (id) => set({ selectedBotId: id }),

  setFilter: (filter) => set({ filter }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  // Computed selectors
  filteredBots: () => {
    const { bots, filter } = get();
    if (filter === 'all') return bots;
    return bots.filter((bot) => bot.status === filter);
  },

  stats: () => {
    const { bots } = get();
    return {
      online: bots.filter((b) => b.status === 'online').length,
      idle: bots.filter((b) => b.status === 'idle').length,
      offline: bots.filter((b) => b.status === 'offline').length,
      total: bots.length,
    };
  },

  selectedBot: () => {
    const { bots, selectedBotId } = get();
    if (!selectedBotId) return null;
    return bots.find((bot) => bot.id === selectedBotId) || null;
  },
}));

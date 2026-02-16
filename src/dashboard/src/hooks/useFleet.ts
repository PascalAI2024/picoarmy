// Fleet actions hook with loading/error state

import { useState, useCallback } from 'react';
import { useFleetStore } from '../stores/fleet';
import * as api from '../lib/api';
import type { CreateBotData } from '../lib/types';

export function useFleet() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setBots, setLoading: setStoreLoading, setError: setStoreError } =
    useFleetStore();

  // Fetch initial fleet data
  const fetchFleet = useCallback(async () => {
    setLoading(true);
    setStoreLoading(true);
    setError(null);
    setStoreError(null);

    try {
      const bots = await api.fetchFleet();
      setBots(bots);
      return bots;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch fleet';
      setError(message);
      setStoreError(message);
      throw err;
    } finally {
      setLoading(false);
      setStoreLoading(false);
    }
  }, [setBots, setStoreLoading, setStoreError]);

  // Spawn new bot
  const spawnBot = useCallback(
    async (config: CreateBotData) => {
      setLoading(true);
      setError(null);

      try {
        const bot = await api.createBot(config);
        // Bot will be added via SSE 'fleet:spawn' event
        return bot;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to spawn bot';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Destroy bot
  const destroyBot = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      await api.deleteBot(id);
      // Bot will be removed via SSE 'fleet:destroy' event
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to destroy bot';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Deploy soul to bot
  const deploySoul = useCallback(async (botId: string, soulName: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.deploySoul(botId, soulName);
      // Bot will be updated via SSE 'fleet:update' event
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to deploy soul';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch bot logs
  const fetchBotLogs = useCallback(async (botId: string, limit = 100) => {
    setLoading(true);
    setError(null);

    try {
      const logs = await api.fetchBotLogs(botId, limit);
      return logs;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch logs';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch available soul templates
  const fetchSouls = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const souls = await api.fetchSouls();
      return souls;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch souls';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    fetchFleet,
    spawnBot,
    destroyBot,
    deploySoul,
    fetchBotLogs,
    fetchSouls,
  };
}

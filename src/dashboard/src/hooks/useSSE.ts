// SSE connection hook with auto-reconnect

import { useEffect, useRef, useState } from 'react';
import { useFleetStore } from '../stores/fleet';
import { useTelemetryStore } from '../stores/telemetry';
import type { Bot, LogEntry } from '../lib/types';

interface UseSSEOptions {
  url?: string;
  enabled?: boolean;
  maxReconnectDelay?: number;
}

export function useSSE(options: UseSSEOptions = {}) {
  const {
    url = '/api/sse',
    enabled = true,
    maxReconnectDelay = 30000, // Max 30s between reconnects
  } = options;

  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef(1000); // Start with 1s delay

  // Store actions
  const { setBots, addBot, removeBot } = useFleetStore();
  const { addLog } = useTelemetryStore();

  const connect = () => {
    // Cleanup existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      // Connection opened
      eventSource.addEventListener('open', () => {
        console.log('[SSE] Connected');
        setConnected(true);
        setError(null);
        reconnectDelayRef.current = 1000; // Reset delay on successful connect
      });

      // Handle 'connected' event
      eventSource.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data);
        console.log('[SSE] Connection confirmed:', data.clientId);
      });

      // Handle 'fleet:update' event
      eventSource.addEventListener('fleet:update', (event) => {
        const bots: Bot[] = JSON.parse(event.data);
        console.log('[SSE] Fleet update:', bots.length, 'bots');
        setBots(bots);
      });

      // Handle 'fleet:spawn' event
      eventSource.addEventListener('fleet:spawn', (event) => {
        const bot: Bot = JSON.parse(event.data);
        console.log('[SSE] Bot spawned:', bot.name);
        addBot(bot);
      });

      // Handle 'fleet:destroy' event
      eventSource.addEventListener('fleet:destroy', (event) => {
        const { id } = JSON.parse(event.data);
        console.log('[SSE] Bot destroyed:', id);
        removeBot(id);
      });

      // Handle 'log:entry' event
      eventSource.addEventListener('log:entry', (event) => {
        const log: LogEntry = JSON.parse(event.data);
        addLog(log);
      });

      // Connection error
      eventSource.addEventListener('error', (event) => {
        console.error('[SSE] Connection error:', event);
        setConnected(false);
        setError('Connection lost');

        // Close and schedule reconnect
        eventSource.close();
        scheduleReconnect();
      });
    } catch (err) {
      console.error('[SSE] Failed to connect:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
      scheduleReconnect();
    }
  };

  const scheduleReconnect = () => {
    if (!enabled) return;

    // Clear existing timeout
    if (reconnectTimeoutRef.current !== null) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    // Exponential backoff with max delay
    const delay = Math.min(reconnectDelayRef.current, maxReconnectDelay);
    console.log(`[SSE] Reconnecting in ${delay}ms`);

    reconnectTimeoutRef.current = window.setTimeout(() => {
      reconnectDelayRef.current = Math.min(
        reconnectDelayRef.current * 2,
        maxReconnectDelay
      );
      connect();
    }, delay);
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current !== null) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setConnected(false);
  };

  // Effect to manage connection lifecycle
  useEffect(() => {
    if (!enabled) {
      disconnect();
      return;
    }

    connect();

    return () => {
      disconnect();
    };
  }, [enabled, url]);

  return {
    connected,
    error,
    reconnect: connect,
    disconnect,
  };
}

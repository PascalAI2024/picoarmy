import { useState, useEffect } from 'react';
import type { LogEntry } from '../lib/types';
import { fetchGlobalLogs } from '../lib/api';

const levelColors = {
  debug: 'text-text-muted',
  info: 'text-accent-cyan',
  warn: 'text-amber-400',
  error: 'text-red-400',
};

const levelBadgeColors = {
  debug: 'bg-text-muted/20 border-text-muted',
  info: 'bg-accent-cyan/20 border-accent-cyan',
  warn: 'bg-amber-400/20 border-amber-400',
  error: 'bg-red-400/20 border-red-400',
};

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [botFilter, setBotFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadLogs = async () => {
    try {
      const data = await fetchGlobalLogs(100, levelFilter, botFilter);
      setLogs(data);
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [levelFilter, botFilter]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadLogs();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, levelFilter, botFilter]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + '.' + date.getMilliseconds().toString().padStart(3, '0');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          Fleet Logs
        </h1>
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`
            px-4 py-2 text-sm font-medium
            border
            transition-colors
            ${autoRefresh
              ? 'bg-accent-cyan/20 border-accent-cyan text-accent-cyan'
              : 'bg-bg-surface border-border text-text-secondary hover:text-text-primary'
            }
          `}
        >
          {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
        </button>
      </div>

      {/* Filters */}
      <div className="panel">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs text-text-secondary mb-2 uppercase tracking-wider">
              Level
            </label>
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="
                w-full px-3 py-2
                bg-bg-surface border border-border
                text-text-primary text-sm
                focus:border-accent-cyan focus:outline-none
                transition-colors
              "
            >
              <option value="">All Levels</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
              <option value="info,warn,error">Info + Warn + Error</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-text-secondary mb-2 uppercase tracking-wider">
              Bot Name Filter
            </label>
            <input
              type="text"
              value={botFilter}
              onChange={(e) => setBotFilter(e.target.value)}
              placeholder="Filter by bot name..."
              className="
                w-full px-3 py-2
                bg-bg-surface border border-border
                text-text-primary text-sm
                focus:border-accent-cyan focus:outline-none
                transition-colors
              "
            />
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="panel overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-text-muted">Loading logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-muted">No logs found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-xs text-text-muted uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-text-muted uppercase tracking-wider">
                    Level
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-text-muted uppercase tracking-wider">
                    Bot
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-text-muted uppercase tracking-wider">
                    Message
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="
                      border-b border-border/50
                      hover:bg-bg-elevated
                      transition-colors
                    "
                  >
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary whitespace-nowrap">
                      {formatTime(log.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`
                          inline-block px-2 py-1 text-xs font-medium
                          border rounded
                          ${levelBadgeColors[log.level as keyof typeof levelBadgeColors] || 'bg-bg-surface border-border'}
                          ${levelColors[log.level as keyof typeof levelColors] || 'text-text-primary'}
                        `}
                      >
                        {log.level.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-text-primary">
                      {log.bot_id}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {log.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-center text-xs text-text-muted">
        Showing {logs.length} log{logs.length !== 1 ? 's' : ''}
        {autoRefresh && ' • Auto-refreshing every 5s'}
      </div>
    </div>
  );
}

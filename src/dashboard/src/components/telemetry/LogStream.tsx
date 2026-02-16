// Auto-scrolling monospace log viewer

import { useEffect, useRef, useState } from 'react';
import { useTelemetryStore } from '../../stores';

interface LogStreamProps {
  maxLines?: number;
  height?: string;
}

export function LogStream({ maxLines = 500, height = '400px' }: LogStreamProps) {
  const { recentLogs } = useTelemetryStore();
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);

  const logs = recentLogs(maxLines);

  // Filter logs
  const filteredLogs = filter
    ? logs.filter(
        (log) =>
          log.message.toLowerCase().includes(filter.toLowerCase()) ||
          log.bot_id.toLowerCase().includes(filter.toLowerCase())
      )
    : logs;

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  // Detect manual scroll
  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;

    // If user scrolled up, disable auto-scroll
    if (scrollTop < lastScrollTop.current && !isAtBottom) {
      setAutoScroll(false);
    }

    lastScrollTop.current = scrollTop;

    // Re-enable auto-scroll if scrolled to bottom
    if (isAtBottom) {
      setAutoScroll(true);
    }
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setAutoScroll(true);
    }
  };

  // Format timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Get level color
  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-amber-400';
      case 'debug':
        return 'text-gray-500';
      case 'info':
      default:
        return 'text-white';
    }
  };

  return (
    <div className="panel flex flex-col" style={{ height }}>
      {/* Header with filter */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-[#1e1e2e]">
        <div className="flex items-center gap-3 flex-1">
          <span className="mono-data text-gray-400 text-sm">LOG STREAM</span>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter logs..."
            className="flex-1 max-w-xs bg-[#0a0a0f] border border-[#1e1e2e] rounded-sm px-3 py-1 mono-data text-sm text-white placeholder-gray-600 focus:border-cyan-500 transition-colors"
          />
        </div>
        <div className="mono-data text-xs text-gray-500">
          {filteredLogs.length} / {logs.length} logs
        </div>
      </div>

      {/* Log content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto space-y-0.5 mono-data text-sm"
        style={{ scrollBehavior: 'smooth' }}
      >
        {filteredLogs.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            {filter ? 'No logs match filter' : 'No logs yet'}
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3 px-2 py-1 hover:bg-white/5 transition-colors"
            >
              <span className="text-gray-600 flex-shrink-0">
                {formatTime(log.timestamp)}
              </span>
              <span className="text-cyan-400 flex-shrink-0">[{log.bot_id}]</span>
              <span className={getLevelColor(log.level)}>{log.message}</span>
            </div>
          ))
        )}
      </div>

      {/* Jump to latest button */}
      {!autoScroll && (
        <div className="mt-3 pt-3 border-t border-[#1e1e2e]">
          <button
            onClick={scrollToBottom}
            className="w-full py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 mono-data text-sm rounded-sm transition-colors border border-cyan-500/30"
          >
            ↓ Jump to latest
          </button>
        </div>
      )}
    </div>
  );
}

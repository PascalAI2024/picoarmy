// Recharts timeline showing bot activity

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useTelemetryStore } from '../../stores';

interface ActivityChartProps {
  height?: number;
  timeWindow?: number; // minutes
}

export function ActivityChart({
  height = 300,
  timeWindow = 60,
}: ActivityChartProps) {
  const { logs } = useTelemetryStore();

  // Aggregate logs into time buckets
  const chartData = useMemo(() => {
    const now = Date.now();
    const windowMs = timeWindow * 60 * 1000;
    const bucketSize = 5 * 60 * 1000; // 5-minute buckets
    const numBuckets = Math.ceil(windowMs / bucketSize);

    // Initialize buckets
    const buckets = Array.from({ length: numBuckets }, (_, i) => {
      const time = now - windowMs + i * bucketSize;
      return {
        time,
        timestamp: new Date(time).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        messages: 0,
        errors: 0,
        warnings: 0,
      };
    });

    // Fill buckets with log data
    logs.forEach((log) => {
      const logTime = new Date(log.timestamp).getTime();
      if (logTime < now - windowMs) return; // Outside window

      const bucketIndex = Math.floor((logTime - (now - windowMs)) / bucketSize);
      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        buckets[bucketIndex].messages++;
        if (log.level === 'error') buckets[bucketIndex].errors++;
        if (log.level === 'warn') buckets[bucketIndex].warnings++;
      }
    });

    return buckets;
  }, [logs, timeWindow]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="surface-glass border border-cyan-500/30 rounded-sm p-3 mono-data text-sm">
        <div className="text-gray-400 mb-2">{payload[0].payload.timestamp}</div>
        <div className="space-y-1">
          <div className="text-white">
            Messages: <span className="text-cyan-400">{payload[0].value}</span>
          </div>
          <div className="text-amber-400">
            Warnings: {payload[0].payload.warnings}
          </div>
          <div className="text-red-400">Errors: {payload[0].payload.errors}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="panel">
      <div className="mb-4 flex items-center justify-between">
        <span className="mono-data text-gray-400 text-sm">
          ACTIVITY (LAST {timeWindow}MIN)
        </span>
        <span className="mono-data text-xs text-gray-600">
          5-minute intervals
        </span>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData}>
          <defs>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.8} />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.2} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />

          <XAxis
            dataKey="timestamp"
            stroke="#4b5563"
            style={{
              fontSize: '0.75rem',
              fontFamily: 'JetBrains Mono, monospace',
            }}
            tick={{ fill: '#6b7280' }}
          />

          <YAxis
            stroke="#4b5563"
            style={{
              fontSize: '0.75rem',
              fontFamily: 'JetBrains Mono, monospace',
            }}
            tick={{ fill: '#6b7280' }}
          />

          <Tooltip content={<CustomTooltip />} />

          <Line
            type="monotone"
            dataKey="messages"
            stroke="url(#lineGradient)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#06b6d4' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

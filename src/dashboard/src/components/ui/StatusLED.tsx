interface StatusLEDProps {
  status: 'online' | 'idle' | 'offline' | 'spawning';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-3 h-3',
};

const statusColorMap = {
  online: 'bg-status-online',
  idle: 'bg-status-idle',
  offline: 'bg-status-offline',
  spawning: 'bg-status-spawning',
};

const glowMap = {
  online: 'glow-green',
  idle: 'glow-amber',
  offline: 'glow-red',
  spawning: 'glow-cyan',
};

export function StatusLED({ status, size = 'md', className = '' }: StatusLEDProps) {
  return (
    <div className="relative">
      {/* Outer glow ring */}
      <div
        className={`
          absolute inset-0 -m-1
          rounded-full
          ${statusColorMap[status]}
          opacity-20
          blur-sm
          animate-pulse-glow
        `}
      />
      {/* LED dot */}
      <div
        className={`
          relative
          status-led
          ${sizeMap[size]}
          ${statusColorMap[status]}
          ${glowMap[status]}
          ${className}
        `}
        aria-label={`Status: ${status}`}
        role="status"
      />
    </div>
  );
}

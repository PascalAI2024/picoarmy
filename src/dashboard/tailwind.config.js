/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Command center dark palette
        bg: {
          DEFAULT: '#0a0a0f',
          surface: '#12121a',
          elevated: '#1a1a24',
        },
        border: {
          DEFAULT: '#1e1e2e',
          subtle: '#16161f',
          hover: '#2a2a3a',
        },
        status: {
          online: '#22c55e',
          idle: '#f59e0b',
          offline: '#ef4444',
          spawning: '#06b6d4',
        },
        accent: {
          cyan: '#06b6d4',
          green: '#22c55e',
          amber: '#f59e0b',
          red: '#ef4444',
        },
        text: {
          primary: '#f5f5f5',
          secondary: '#a1a1aa',
          muted: '#71717a',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'glow-green': '0 0 20px rgba(34, 197, 94, 0.3), 0 0 40px rgba(34, 197, 94, 0.1)',
        'glow-amber': '0 0 20px rgba(245, 158, 11, 0.3), 0 0 40px rgba(245, 158, 11, 0.1)',
        'glow-red': '0 0 20px rgba(239, 68, 68, 0.3), 0 0 40px rgba(239, 68, 68, 0.1)',
        'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.3), 0 0 40px rgba(6, 182, 212, 0.1)',
      },
      borderRadius: {
        DEFAULT: '2px',
        'sm': '1px',
        'md': '2px',
        'lg': '4px',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '50%': { opacity: '0.7', filter: 'brightness(1.3)' },
        }
      }
    },
  },
  plugins: [],
}

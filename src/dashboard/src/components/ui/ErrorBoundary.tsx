import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg flex items-center justify-center">
          <div className="max-w-md w-full panel space-y-4 text-center">
            <div className="text-4xl text-status-offline">!</div>
            <h2 className="mono-data text-lg text-text-primary">
              Something went wrong
            </h2>
            <p className="text-sm text-text-secondary">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/';
              }}
              className="
                px-4 py-2 text-sm
                bg-accent-cyan/20 border border-accent-cyan
                text-accent-cyan
                hover:bg-accent-cyan/30
                transition-colors
              "
            >
              Recover
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

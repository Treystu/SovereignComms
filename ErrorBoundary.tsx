import { Component, ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(_error: unknown): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
    this.setState({
      error: error instanceof Error ? error : new Error(String(error)),
      errorInfo,
    });
  }

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;
      return (
        <div className="card" style={{ maxWidth: 600, margin: '20px auto' }}>
          <h2>Something went wrong.</h2>
          {error && (
            <div className="small" style={{ marginTop: 8 }}>
              {error.message}
            </div>
          )}
          {errorInfo && (
            <pre
              className="small"
              style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}
            >
              {errorInfo.componentStack}
            </pre>
          )}
          <button
            onClick={() =>
              this.setState({
                hasError: false,
                error: undefined,
                errorInfo: undefined,
              })
            }
            style={{ marginTop: 12 }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

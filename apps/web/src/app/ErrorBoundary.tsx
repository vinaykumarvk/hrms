import { Component, ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  onError?: () => void;
}

interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    this.props.onError?.();
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="fatal-error" aria-labelledby="fatal-error-title">
        <section className="operational-state" role="alert">
          <p className="state-label">error</p>
          <h1 id="fatal-error-title">This workspace could not be displayed</h1>
          <p>Your session is still protected. Retry the view or return to the application start.</p>
          <div className="action-row">
            <button type="button" onClick={() => window.location.reload()}>Reload application</button>
            <a href="/">Go to start</a>
          </div>
        </section>
      </main>
    );
  }
}

/**
 * ErrorBoundary
 * =============
 * Class component that catches render-time errors in its subtree and
 * displays a graceful fallback instead of a blank/broken page.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <MyComponent />
 *   </ErrorBoundary>
 *
 *   // Custom fallback:
 *   <ErrorBoundary fallback={<p>Something broke.</p>}>
 *     <MyComponent />
 *   </ErrorBoundary>
 */

import React, { Component, type ReactNode, type ErrorInfo } from 'react';

// ── Props / State ─────────────────────────────────────────────────────────────

interface Props {
  children:  ReactNode;
  /** Custom fallback UI to display instead of the default error card. */
  fallback?: ReactNode;
  /** Optional callback fired on each caught error. */
  onError?(error: Error, info: ErrorInfo): void;
}

interface State {
  hasError:   boolean;
  error:      Error | null;
  errorInfo:  ErrorInfo | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // Log to console (replace with your telemetry sink in production)
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    const isDev = import.meta.env.DEV;

    return (
      <div
        role="alert"
        style={{
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'center',
          justifyContent:'center',
          minHeight:     '100vh',
          padding:       '2rem',
          background:    '#0f172a',
          color:         '#f1f5f9',
          fontFamily:    'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth:     '640px',
            width:        '100%',
            borderRadius: '12px',
            border:       '1px solid #334155',
            background:   '#1e293b',
            padding:      '2.5rem',
          }}
        >
          <h1 style={{ color: '#ef4444', marginTop: 0 }}>
            Something went wrong
          </h1>

          <p style={{ color: '#94a3b8' }}>
            An unexpected error occurred. You can try reloading the page or
            resetting this section.
          </p>

          {isDev && this.state.error && (
            <pre
              style={{
                overflow:   'auto',
                background: '#0f172a',
                border:     '1px solid #334155',
                borderRadius: '6px',
                padding:    '1rem',
                fontSize:   '0.75rem',
                color:      '#fca5a5',
                whiteSpace: 'pre-wrap',
                wordBreak:  'break-word',
              }}
            >
              {this.state.error.toString()}
              {this.state.errorInfo?.componentStack}
            </pre>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding:       '0.5rem 1.25rem',
                borderRadius:  '6px',
                border:        'none',
                background:    '#3b82f6',
                color:         '#fff',
                cursor:        'pointer',
                fontWeight:    600,
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding:      '0.5rem 1.25rem',
                borderRadius: '6px',
                border:       '1px solid #475569',
                background:   'transparent',
                color:        '#cbd5e1',
                cursor:       'pointer',
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;

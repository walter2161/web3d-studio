import React from 'react';

interface State { error: Error | null; info: React.ErrorInfo | null }

/**
 * Top-level error boundary. Renders a visible error card with the message and
 * stack instead of leaving the user with a gray screen when a render throws.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, info: null };
  static getDerivedStateFromError(error: Error) { return { error, info: null }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
    this.setState({ error, info });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#111', color: '#eee', padding: 24, overflow: 'auto', fontFamily: 'monospace', fontSize: 12, zIndex: 999999 }}>
        <h1 style={{ color: '#ff6b6b', fontSize: 16, marginBottom: 12 }}>App crashed — please copy this and send back:</h1>
        <div style={{ color: '#ffd166', marginBottom: 8 }}>{String(this.state.error?.message || this.state.error)}</div>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error?.stack}</pre>
        {this.state.info?.componentStack && (
          <>
            <h2 style={{ color: '#8ecae6', fontSize: 13, marginTop: 12 }}>Component stack</h2>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.info.componentStack}</pre>
          </>
        )}
        <button
          onClick={() => { try { localStorage.clear(); } catch {} location.reload(); }}
          style={{ marginTop: 16, background: '#ffd166', color: '#111', padding: '6px 12px', border: 'none', cursor: 'pointer' }}
        >
          Clear local state and reload
        </button>
      </div>
    );
  }
}

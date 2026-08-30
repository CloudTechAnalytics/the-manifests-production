import { Component, type ReactNode } from 'react';

/**
 * Wraps the entire app (src/main.tsx) — replaces Next's global-error.tsx,
 * which caught failures in the root layout itself (before AuthProvider/
 * ThemeProvider/globals.css could be trusted to work). Same reasoning
 * applies here: this can't rely on any context or even Tailwind classes
 * resolving correctly, so it's self-styled with inline styles, same as
 * the file it replaces.
 */
export class RootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('Unhandled error at the app root:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4rem 1.5rem',
          textAlign: 'center',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          backgroundColor: '#fdfcfb',
          color: '#241f16',
        }}
      >
        <div
          style={{
            display: 'flex',
            height: '3rem',
            width: '3rem',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '9999px',
            backgroundColor: '#fee2e2',
          }}
        >
          <span style={{ fontSize: '1.5rem' }} aria-hidden="true">
            ⚠️
          </span>
        </div>
        <h1 style={{ marginTop: '1rem', fontSize: '1.25rem', fontWeight: 700 }}>
          Something went wrong
        </h1>
        <p
          style={{
            marginTop: '0.5rem',
            maxWidth: '28rem',
            fontSize: '0.875rem',
            color: '#6b6357',
          }}
        >
          The application hit an unexpected error and couldn&apos;t load. Try
          reloading the page.
        </p>
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              backgroundColor: '#c7943d',
              color: '#241f16',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid #d8d2c4',
              color: '#241f16',
              fontSize: '0.875rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Go home
          </a>
        </div>
      </div>
    );
  }
}

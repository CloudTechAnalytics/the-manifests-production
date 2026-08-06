'use client';

import { useEffect } from 'react';

// This boundary replaces the ENTIRE root layout (including <html>/<body>)
// when something in the root layout itself throws — so it must supply its
// own document shell and can't rely on globals.css, fonts, or any context
// providers (AuthProvider, ThemeProvider) that may be the very thing that
// failed. Kept deliberately minimal and self-styled for maximum resilience.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Unhandled error in root layout:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
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
        {error.digest && (
          <p
            style={{
              marginTop: '0.5rem',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              color: '#a39c8f',
            }}
          >
            Reference: {error.digest}
          </p>
        )}
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={reset}
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
      </body>
    </html>
  );
}

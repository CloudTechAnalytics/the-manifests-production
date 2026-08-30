import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

// Inter for all regular UI (body, buttons, tables, labels). Playfair
// Display for hero/brand moments — logo, page titles, the dashboard
// greeting. Self-hosted via @fontsource (replaces next/font/google —
// same fonts, same weights, no Next-specific loader API). Loaded at
// 500/600/700/800 for Playfair so a heading set at any of those
// weights renders a real cut of the font, never synthetic/faux bold.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/playfair-display/500.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/800.css';
import './globals.css';

import { AuthProvider } from '@/shared/contexts/auth-context';
import { ThemeProvider } from '@/shared/contexts/theme-context';
import { Toaster } from '@/shared/components/ui/sonner';
import { RootErrorBoundary } from '@/shared/components/root-error-boundary';
import { router } from './app/router';
import { queryClient } from './app/query-client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <RouterProvider router={router} />
            <Toaster />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </RootErrorBoundary>
  </StrictMode>
);

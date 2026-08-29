import './globals.css';
import type { Metadata } from 'next';
import { Inter, Playfair_Display, Noto_Sans } from 'next/font/google';
import { AuthProvider } from '@/contexts/auth-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { Toaster } from '@/components/ui/sonner';

// Inter for all regular UI (body, buttons, tables, labels). Playfair
// Display for hero/brand moments — logo, page titles, the dashboard
// greeting. Loaded at 500/600/700/800 (matching the design reference
// exactly) so a heading set at any of those weights renders a real
// cut of the font, never a synthetic/faux bold.
//
// Neither Google font actually contains a glyph for the Naira sign
// (₦, U+20A6) — confirmed by rendering it with each font explicitly
// set and nothing else in the stack: it silently fell back to the
// browser's own system-font substitute (Segoe UI Symbol on Windows),
// which renders far heavier/blacker than the Inter digits sitting
// right next to it. That's the "different font" every currency figure
// in the app has been showing — not the digits, just that one glyph.
// Noto Sans has real Naira coverage (Google's own "latin-ext" subset,
// U+20A0-20AB) at a weight that actually matches Inter, so it's loaded
// here purely to fill that gap. next/font's `fallback` option needs a
// static string literal, which a second font's generated (hashed)
// family name isn't — so instead both fonts are exposed as CSS custom
// properties and composed into one stack directly in globals.css
// (`body { font-family: var(--font-sans), var(--font-sans-fallback), ... }`
// and the `serif` entry in tailwind.config.ts), which has no such
// restriction. Every other character keeps rendering in Inter/Playfair
// exactly as before — this only ever gets reached for a glyph neither
// of them has.
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const notoSansFallback = Noto_Sans({
  subsets: ['latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-sans-fallback',
});
const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-serif',
});

export const metadata: Metadata = {
  title: 'The Manifest — CloudTech Logistics Suite',
  description:
    'Cloud-based freight operations platform for forwarding companies. Manage customers, quotations, shipments, and documents.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${notoSansFallback.variable} ${playfairDisplay.variable}`}>
        <AuthProvider>
          <ThemeProvider>
            {children}
            <Toaster />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

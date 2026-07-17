import './globals.css';
import type { Metadata } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';
import { AuthProvider } from '@/contexts/auth-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({ subsets: ['latin'] });

// Instrument Serif ships a single weight (400). Heading classes therefore
// use font-normal — requesting 500/600 would only trigger the browser's
// synthetic bolding, which smears this face badly at display sizes.
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-serif',
});

export const metadata: Metadata = {
  title: 'The Manifest — Freight Operations Management',
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
      <body className={`${inter.className} ${instrumentSerif.variable}`}>
        <AuthProvider><ThemeProvider>{children}</ThemeProvider></AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}

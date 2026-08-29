import './globals.css';
import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { AuthProvider } from '@/contexts/auth-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { Toaster } from '@/components/ui/sonner';

// Inter for all regular UI (body, buttons, tables, labels). Playfair
// Display for hero/brand moments — logo, page titles, the dashboard
// greeting. Loaded at 500/600/700/800 (matching the design reference
// exactly) so a heading set at any of those weights renders a real
// cut of the font, never a synthetic/faux bold.
const inter = Inter({ subsets: ['latin'] });
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
      <body className={`${inter.className} ${playfairDisplay.variable}`}>
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

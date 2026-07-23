import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/contexts/auth-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { Toaster } from '@/components/ui/sonner';

// One typeface, throughout — Inter. Titles and the dashboard greeting are
// just bold Inter, not a separate display face.
const inter = Inter({ subsets: ['latin'] });

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
      <body className={inter.className}>
        <AuthProvider><ThemeProvider>{children}</ThemeProvider></AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}

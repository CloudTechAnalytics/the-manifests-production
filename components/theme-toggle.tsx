'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/contexts/theme-context';
import { Button } from '@/components/ui/button';

/**
 * Quick light/dark toggle for a header — flips between the two explicit
 * states in one click. The full Light/Dark/System picker lives on each
 * shell's own Settings page (Preferences tab); this is a shortcut, not a
 * replacement. Shared by the tenant TopBar/MobileTopBar
 * (components/layout/sidebar.tsx) and the Platform Console header
 * (app/platform/layout.tsx) — one implementation, so both shells' toggles
 * can never drift apart.
 *
 * Reads the currently-*applied* appearance (via a MutationObserver on
 * <html class="dark">) rather than just the raw `theme` preference, so a
 * "system" user sees the icon matching what they're actually looking at.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [theme]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className ?? 'rounded-full text-muted-foreground'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}

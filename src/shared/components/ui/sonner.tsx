'use client';

import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/shared/contexts/theme-context';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/*
 * The app's one toast surface — every `toast.success()`/`toast.error()`/
 * `toast.promise()` call across the whole app renders through this.
 *
 * Reads theme from the app's real theme system (contexts/theme-context.tsx,
 * which toggles `<html class="dark">` directly) rather than `next-themes` —
 * that package is installed but never mounted as a provider anywhere in
 * this app, so reading from it left toasts always rendering as if the
 * theme were stuck on its default, never matching a manually-chosen
 * Dark/Light preference. <Toaster /> lives inside <ThemeProvider> in
 * app/layout.tsx so this useTheme() call has a provider to read from.
 *
 * Back to the original quiet bottom-right corner style — a top-center,
 * richColors, bigger-icon "can't miss it" version was tried and reverted
 * per explicit feedback.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };

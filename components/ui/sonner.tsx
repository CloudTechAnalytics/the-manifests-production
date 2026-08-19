'use client';

import { Loader2, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/contexts/theme-context';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/*
 * The app's one toast surface — every `toast.success()`/`toast.error()`/
 * `toast.promise()` call across the whole app renders through this, so
 * restyling it here is a single-file change that makes every existing
 * save/create/delete confirmation more prominent at once, no per-page
 * changes needed.
 *
 * Was reading theme from `next-themes`'s useTheme() — a package that's
 * installed but never actually mounted as a provider anywhere in this
 * app (the real theme system is contexts/theme-context.tsx, toggling
 * `<html class="dark">` directly) — so toasts always rendered as if the
 * theme were stuck on its default, never actually matching a manually-
 * chosen Dark/Light preference. Fixed to read the app's real theme.
 *
 * top-center + richColors + bigger icons/text is deliberately closer to
 * a "can't miss it" confirmation than a quiet corner strip — for a
 * loading -> success/error transition, pair with toast.promise() (or
 * toast.loading(id) then toast.success(id)) at the call site; this
 * styling is what that promise toast renders through automatically.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      position="top-center"
      richColors
      closeButton
      duration={4000}
      icons={{
        loading: <Loader2 className="h-5 w-5 animate-spin" />,
        success: <CheckCircle2 className="h-5 w-5" />,
        error: <XCircle className="h-5 w-5" />,
        warning: <AlertTriangle className="h-5 w-5" />,
        info: <Info className="h-5 w-5" />,
      }}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-xl group-[.toaster]:rounded-xl group-[.toaster]:py-4 group-[.toaster]:px-5 group-[.toaster]:gap-3',
          title: 'group-[.toast]:text-base group-[.toast]:font-semibold',
          description: 'group-[.toast]:text-muted-foreground',
          icon: 'group-[.toast]:h-6 group-[.toast]:w-6',
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

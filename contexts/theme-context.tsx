'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { ThemePreference, UserPreferences } from '@/types';

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (t: ThemePreference) => Promise<void>;
  preferences: UserPreferences | null;
  setPreferences: (p: Partial<UserPreferences>) => Promise<void>;
  loading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'freightops-theme';

function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', isDark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const [preferences, setPreferencesState] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPreferences = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) { console.error('Error fetching preferences:', error); setLoading(false); return; }

    if (data) {
      setPreferencesState(data as UserPreferences);
      setThemeState(data.theme as ThemePreference);
      applyTheme(data.theme as ThemePreference);
    } else {
      const { data: newData, error: insertError } = await supabase
        .from('user_preferences')
        .insert({ user_id: user.id })
        .select()
        .maybeSingle();

      if (insertError) { console.error('Error creating preferences:', insertError); }
      if (newData) {
        setPreferencesState(newData as UserPreferences);
        setThemeState('system');
        applyTheme('system');
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    if (stored) { setThemeState(stored); applyTheme(stored); }
    fetchPreferences();
  }, [fetchPreferences]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback(async (t: ThemePreference) => {
    setThemeState(t);
    applyTheme(t);
    localStorage.setItem(STORAGE_KEY, t);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('user_preferences').update({ theme: t, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    setPreferencesState((prev) => prev ? { ...prev, theme: t } : prev);
  }, []);

  const setPreferences = useCallback(async (p: Partial<UserPreferences>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('user_preferences').update({ ...p, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    setPreferencesState((prev) => prev ? { ...prev, ...p } : prev);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, preferences, setPreferences, loading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

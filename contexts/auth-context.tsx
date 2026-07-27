'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Profile } from '@/types';

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (uid: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, branch:branches(*)')
      .eq('id', uid)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }

    const p = data as Profile | null;

    // Load the organization separately rather than as an embed: if this
    // fails (RLS, a relationship quirk), it must NOT null out the whole
    // profile — that would blank the user's name and role app-wide.
    if (p?.organization_id) {
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', p.organization_id)
        .maybeSingle();
      if (orgError) {
        console.error('Error fetching organization:', orgError);
      } else {
        p.organization = (org as Profile['organization']) ?? null;
      }
    }

    return p;
  };

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).then((p) => {
          if (isMounted) { setProfile(p); setLoading(false); }
        }).catch(() => { if (isMounted) setLoading(false); });
      } else {
        setLoading(false);
      }
    }).catch(() => {
      // A rejected getSession (e.g. an invalid/expired refresh token left
      // in storage) must still resolve the loading state, or the app hangs
      // on the splash spinner forever. Treat it as "no session" so the
      // router falls through to /login.
      if (!isMounted) return;
      setSession(null);
      setUser(null);
      setProfile(null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        (async () => {
          if (!isMounted) return;
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            const p = await fetchProfile(session.user.id);
            if (isMounted) setProfile(p);
          } else {
            if (isMounted) setProfile(null);
          }
          if (isMounted) setLoading(false);
        })();
      }
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, session, loading, signIn, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

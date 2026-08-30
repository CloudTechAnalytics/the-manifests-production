'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/shared/lib/supabase/client';
import { isSessionIdleExpired, markActive, clearActivity, startActivityTracking } from '@/shared/lib/utils/idle-session';
import type { Profile, UserRole } from '@/shared/types';

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  /** Primary role (profile.role) plus every additional role from
   *  user_roles, deduped. A user can hold more than one department. */
  roles: UserRole[];
  /** True if the current user holds this role, primary or additional. */
  hasRole: (role: UserRole) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoles = async (uid: string, primaryRole: UserRole | undefined) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', uid);
    if (error) {
      console.error('Error fetching additional roles:', error);
      return primaryRole ? [primaryRole] : [];
    }
    const additional = (data ?? []).map((r) => r.role as UserRole);
    return primaryRole ? Array.from(new Set([primaryRole, ...additional])) : additional;
  };

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

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;

      // A session left idle past the timeout is deliberately not
      // restored — sign it out and fall through to /login instead of
      // silently logging the user back in.
      if (session?.user && isSessionIdleExpired()) {
        await supabase.auth.signOut();
        clearActivity();
        if (!isMounted) return;
        setSession(null);
        setUser(null);
        setProfile(null);
        setRoles([]);
        setLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        markActive();
        fetchProfile(session.user.id).then(async (p) => {
          if (!isMounted) return;
          setProfile(p);
          setRoles(await fetchRoles(session.user.id, p?.role));
          setLoading(false);
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
      setRoles([]);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        (async () => {
          if (!isMounted) return;

          // INITIAL_SESSION fires immediately on subscribing, carrying the
          // exact same session the getSession() call above already
          // resolved — the profile/roles fetch above already covers it, so
          // running it a second time here would just duplicate 3 queries
          // on every single app load for no reason. TOKEN_REFRESHED fires
          // roughly hourly and changes only the JWT, never who the user
          // is — re-fetching profile/roles for it would silently re-run
          // every hook keyed on `profile` app-wide (dashboard, warehouse,
          // sidebar badges, notifications) while the user is just sitting
          // on a page. Both still update session/user, which IS what
          // changed, so components reading the fresh token stay correct.
          if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
            setSession(session);
            setUser(session?.user ?? null);
            return;
          }

          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            markActive();
            const p = await fetchProfile(session.user.id);
            if (isMounted) setProfile(p);
            const r = await fetchRoles(session.user.id, p?.role);
            if (isMounted) setRoles(r);
          } else {
            clearActivity();
            if (isMounted) { setProfile(null); setRoles([]); }
          }
          if (isMounted) setLoading(false);
        })();
      }
    );

    const stopActivityTracking = startActivityTracking();

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
      stopActivityTracking();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearActivity();
    setProfile(null);
    setUser(null);
    setSession(null);
    setRoles([]);
  };

  const refreshProfile = async () => {
    if (!user) return;
    const p = await fetchProfile(user.id);
    setProfile(p);
    setRoles(await fetchRoles(user.id, p?.role));
  };

  const hasRole = (role: UserRole) => roles.includes(role);

  return (
    <AuthContext.Provider
      value={{ user, profile, session, loading, roles, hasRole, signIn, signOut, refreshProfile }}
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

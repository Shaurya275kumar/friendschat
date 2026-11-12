import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';
import { Profile } from './types';

const HEARTBEAT_INTERVAL = 30000;
const STALE_THRESHOLD_MS = 90000;

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updatePresence: (isOnline: boolean) => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    if (error) {
      console.warn('loadProfile error', error.message);
      return null;
    }
    setProfile(data as Profile | null);
    return data as Profile | null;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  const updatePresence = useCallback(async (isOnline: boolean) => {
    if (!user) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('presence')
      .upsert({
        user_id: user.id,
        is_online: isOnline,
        last_seen: now,
      });
    if (error) {
      await supabase
        .from('presence')
        .update({ is_online: isOnline, last_seen: now })
        .eq('user_id', user.id);
    }
    // The DB trigger syncs profiles.is_online from presence automatically.
    // Also run stale cleanup so other users who closed their tab get marked offline.
    await supabase.rpc('cleanup_stale_presence');
  }, [user]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      (async () => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          await loadProfile(newSession.user.id);
        } else {
          setProfile(null);
        }
        if (mounted) setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Presence heartbeat: mark online when app is active, offline when backgrounded/closed
  useEffect(() => {
    if (!user) return;
    updatePresence(true);

    const sub = AppState.addEventListener('change', (state) => {
      updatePresence(state === 'active');
    });

    // Periodic heartbeat to keep presence fresh and clean up stale users
    const heartbeat = setInterval(() => {
      updatePresence(true);
    }, HEARTBEAT_INTERVAL);

    // On web, mark offline when the tab is closed or navigated away
    let beforeUnloadHandler: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      beforeUnloadHandler = () => {
        // Use sendBeacon for best-effort offline signal on page unload
        const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/rest/v1/presence?user_id=eq.${user.id}`;
        const body = JSON.stringify({ is_online: false, last_seen: new Date().toISOString() });
        try {
          // sendBeacon can't set headers, so use a fetch with keepalive instead
          fetch(url, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
              Authorization: `Bearer ${session?.access_token ?? ''}`,
            },
            body,
            keepalive: true,
          }).catch(() => {});
        } catch {}
      };
      window.addEventListener('beforeunload', beforeUnloadHandler);
    }

    return () => {
      sub.remove();
      clearInterval(heartbeat);
      if (beforeUnloadHandler && typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', beforeUnloadHandler);
      }
      updatePresence(false);
    };
  }, [user, updatePresence, session?.access_token]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    return { error: error?.message ?? null };
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, name: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { email: cleanEmail, name } },
    });

    // If the email is already registered, try signing in instead — the auth
    // user may exist without a profile (orphaned from a partial deletion).
    // We sign in and create the missing profile so the user can proceed.
    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError) return { error: 'This email is already registered. Try signing in instead.' };

        const uid = signInData.user?.id;
        if (!uid) return { error: 'Sign-in failed after registration. Please try again.' };

        // Create the missing profile
        await supabase.from('profiles').upsert({ id: uid, email: cleanEmail, name });
        await supabase.from('presence').upsert({
          user_id: uid,
          is_online: true,
          last_seen: new Date().toISOString(),
        });
        await loadProfile(uid);
        return { error: null };
      }
      return { error: error.message };
    }

    const uid = data.user?.id;
    if (!uid) return { error: 'Sign-up failed. Please try again.' };

    const { error: profileError } = await supabase.from('profiles').insert({
      id: uid,
      email: cleanEmail,
      name,
    });
    if (profileError) {
      await supabase.from('profiles').upsert({ id: uid, email: cleanEmail, name });
    }

    await supabase.from('presence').upsert({
      user_id: uid,
      is_online: true,
      last_seen: new Date().toISOString(),
    });

    await loadProfile(uid);
    return { error: null };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await updatePresence(false);
    await supabase.auth.signOut();
    setProfile(null);
  }, [updatePresence]);

  const value: AuthState = {
    session,
    user,
    profile,
    loading,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    refreshProfile,
    updatePresence,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

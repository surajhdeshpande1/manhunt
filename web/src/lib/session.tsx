import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { rpc, supabase } from './supabase';
import type { Profile } from './types';
import { DEMO, DEMO_ME, exitDemo } from '../demo/mode';

type Ctx = {
  session: Session | null; profile: Profile | null; ready: boolean; recovering: boolean;
  refresh: () => Promise<Profile | null>; signOut: () => Promise<void>; clearRecovery: () => void;
};
const SessionCtx = createContext<Ctx>(null as any);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [recovering, setRecovering] = useState(false);

  const refresh = useCallback(async () => {
    try { const p = await rpc<Profile | null>('my_profile'); setProfile(p); return p; }
    catch { setProfile(null); return null; }
  }, []);

  useEffect(() => {
    if (DEMO) {
      // the demo has its own signed-in developer; the real session is left untouched
      setSession({ user: { id: DEMO_ME }, access_token: 'demo' } as unknown as Session);
      refresh().then(() => setReady(true));
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session) await refresh();
      setReady(true);
    });
    // Never await Supabase calls inside this callback: the client holds an auth lock while it runs,
    // so a nested call deadlocks. Defer follow-up work to the next tick instead.
    const { data: sub } = supabase.auth.onAuthStateChange((ev, s) => {
      setSession(s);
      if (ev === 'PASSWORD_RECOVERY') setRecovering(true);
      if (ev === 'SIGNED_OUT') setProfile(null);
      if (ev === 'SIGNED_IN' && s) setTimeout(() => { refresh(); }, 0);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [refresh]);

  const signOut = useCallback(async () => { if (DEMO) { exitDemo(); return; } await supabase.auth.signOut(); setProfile(null); }, []);
  const value = useMemo(() => ({ session, profile, ready, recovering, refresh, signOut, clearRecovery: () => setRecovering(false) }),
    [session, profile, ready, recovering, refresh, signOut]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
export const useSession = () => useContext(SessionCtx);

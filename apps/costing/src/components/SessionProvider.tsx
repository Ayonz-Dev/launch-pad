"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getActiveMembership, getCostingPermissions } from "@/lib/supabase/queries";

export type SessionStatus =
  | "offline" // Supabase env not configured — calculator-only mode
  | "loading"
  | "anonymous" // configured, but no signed-in user
  | "no_org" // signed in, but not a member of any organisation yet
  | "authenticated";

export interface SessionValue {
  status: SessionStatus;
  configured: boolean;
  userId: string | null;
  userEmail: string | null;
  organizationId: string | null;
  organizationName: string | null;
  permissions: string[];
  can: (permissionKey: string) => boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

const OFFLINE: Omit<SessionValue, "can" | "refresh" | "signOut"> = {
  status: "offline",
  configured: false,
  userId: null,
  userEmail: null,
  organizationId: null,
  organizationName: null,
  permissions: [],
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [state, setState] = useState<Omit<SessionValue, "can" | "refresh" | "signOut">>(
    configured ? { ...OFFLINE, status: "loading", configured: true } : OFFLINE,
  );

  const refresh = useCallback(async () => {
    if (!configured) {
      setState(OFFLINE);
      return;
    }
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setState({ ...OFFLINE, status: "anonymous", configured: true });
      return;
    }
    try {
      const membership = await getActiveMembership(supabase, user.id);
      if (!membership) {
        setState({
          ...OFFLINE,
          status: "no_org",
          configured: true,
          userId: user.id,
          userEmail: user.email ?? null,
        });
        return;
      }
      const permissions = await getCostingPermissions(supabase, user.id, membership.organizationId);
      setState({
        status: "authenticated",
        configured: true,
        userId: user.id,
        userEmail: user.email ?? null,
        organizationId: membership.organizationId,
        organizationName: membership.organizationName,
        permissions,
      });
    } catch {
      // Signed in but directory reads failed (e.g. schema not exposed yet).
      setState({
        ...OFFLINE,
        status: "no_org",
        configured: true,
        userId: user.id,
        userEmail: user.email ?? null,
      });
    }
  }, [configured]);

  const signOut = useCallback(async () => {
    if (!configured) return;
    await createClient().auth.signOut();
    setState({ ...OFFLINE, status: "anonymous", configured: true });
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    void refresh();
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [configured, refresh]);

  const value = useMemo<SessionValue>(() => {
    const permissionSet = new Set(state.permissions);
    return {
      ...state,
      can: (permissionKey: string) => permissionSet.has(permissionKey),
      refresh,
      signOut,
    };
  }, [state, refresh, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used within a SessionProvider.");
  return context;
}

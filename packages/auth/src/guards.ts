// Server-side session and role guards for App Router server components.
//
// These take an already-created server Supabase client (from
// createServerSupabase) so this package stays free of any framework import.
// The caller decides what to do on failure (redirect, throw); these just load
// and check.
//
// Australian English. No em dashes.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CostingRole, Database, Profile } from '@launchpad/db';

export type AppSupabase = SupabaseClient<Database>;

export interface SessionUser {
  id: string;
  email: string | null;
  profile: Profile;
}

// Load the signed-in user and their profile row. Returns null when there is no
// session or no profile, so the caller can redirect to /login.
export async function loadSessionUser(
  supabase: AppSupabase,
): Promise<SessionUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  return { id: user.id, email: user.email ?? null, profile };
}

// True when the user holds one of the allowed roles.
export function hasRole(
  user: SessionUser,
  allowed: readonly CostingRole[],
): boolean {
  return allowed.includes(user.profile.role);
}

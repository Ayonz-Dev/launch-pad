// Server-only shell helpers: the Next cookies() adapter for the shared Supabase
// server client, and a session guard that redirects to the login page. Every
// app uses these instead of hand rolling their own.
//
// Australian English. No em dashes.

import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@launchpad/db/server';
import { loadSessionUser, type AppSupabase, type SessionUser } from '@launchpad/auth';

// Wire the shared server client to Next's cookies() store. Kept here (not in
// @launchpad/db) because next/headers is Next only and the db package stays
// framework neutral.
export function getServerSupabase(): AppSupabase {
  const cookieStore = cookies();
  return createServerSupabase({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      } catch {
        // Called from a server component where cookies are read only. The
        // middleware refresh handles rotation, so this is safe to ignore.
      }
    },
  });
}

// Require a signed-in user with a profile, or redirect to the login page.
// Returns both the user and the client so a caller can keep querying.
export async function requireUser(
  loginPath = '/login',
): Promise<{ user: SessionUser; supabase: AppSupabase }> {
  const supabase = getServerSupabase();
  const user = await loadSessionUser(supabase);
  if (!user) redirect(loginPath);
  return { user, supabase };
}

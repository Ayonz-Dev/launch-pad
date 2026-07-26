// App-local adapter: wire the shared server client to Next's cookies() store.
//
// Kept in the app (not in @launchpad/db) because next/headers is a Next-only
// import and the db package stays framework neutral. Server components and
// route handlers call this; middleware builds its own adapter over the
// request/response cookies.
//
// Australian English. No em dashes.

import { cookies } from 'next/headers';
import { createServerSupabase } from '@launchpad/db/server';

export function getServerSupabase() {
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

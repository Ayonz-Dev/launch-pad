// Shared session-refresh middleware. Each app's middleware.ts becomes a two
// line re-export of this factory plus its matcher config.
//
// Australian English. No em dashes.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@launchpad/db/server';

export function createSessionMiddleware() {
  return async function middleware(request: NextRequest) {
    let response = NextResponse.next({ request });

    const supabase = createServerSupabase({
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    });

    // Touch the session so @supabase/ssr can rotate the auth cookies.
    await supabase.auth.getUser();

    return response;
  };
}

// The default matcher: everything except static assets and image optimisation.
// Apps re-export this as their middleware `config`.
export const defaultMiddlewareConfig = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

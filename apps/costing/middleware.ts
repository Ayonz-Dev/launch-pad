// Refresh the Supabase auth session on each request so server components always
// see a current session. Adapted from the @supabase/ssr Next.js guidance.
//
// Australian English. No em dashes.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@launchpad/db/server';

export async function middleware(request: NextRequest) {
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
}

export const config = {
  // Run on everything except static assets and image optimisation.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

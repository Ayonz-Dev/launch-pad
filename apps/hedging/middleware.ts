// Session refresh and login gate, from the shared identity.
//
// When Supabase is configured, every request refreshes the session and any
// unauthenticated request (except /login) is redirected to the shared login. To
// preserve the app's no-keys sample mode, the gate is skipped entirely when the
// Supabase environment is not set, so it still renders on bundled sample data
// with no backend.
//
// Australian English. No em dashes.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@launchpad/db/server';

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Not configured: sample mode, no gate.
  if (!url || !anon) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerSupabase({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      cookiesToSet.forEach(({ name, value, options }) =>
        response.cookies.set(name, value, options),
      );
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname !== '/login') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

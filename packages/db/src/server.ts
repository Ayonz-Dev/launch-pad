// Server Supabase client for server components, route handlers and middleware.
//
// The cookie adapter is passed in by the caller so this package does not depend
// on next/headers directly. In a Next App Router server component you pass the
// result of cookies() from next/headers; in middleware you pass an adapter over
// the request and response cookies (see apps/costing/middleware.ts).
//
// Australian English. No em dashes.

import { createServerClient } from '@supabase/ssr';
import type { Database } from './types';

// The subset of the @supabase/ssr cookie interface we rely on. Matches the
// Next.js cookies() store closely enough to pass it straight through.
export interface CookieAdapter {
  getAll(): { name: string; value: string }[];
  setAll(
    cookies: { name: string; value: string; options?: CookieSetOptions }[],
  ): void;
}

export interface CookieSetOptions {
  path?: string;
  maxAge?: number;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'strict' | 'lax' | 'none' | boolean;
  expires?: Date;
}

export function createServerSupabase(cookies: CookieAdapter) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Copy .env.local.example to .env.local and fill in the Supabase keys.',
    );
  }

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (
        cookiesToSet: {
          name: string;
          value: string;
          options?: CookieSetOptions;
        }[],
      ) => cookies.setAll(cookiesToSet),
    },
  });
}

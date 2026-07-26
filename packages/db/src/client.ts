// Browser Supabase client for use in client components.
//
// Reads the public env vars. Never import the service role key here; anything
// in a client component ships to the browser.
//
// Australian English. No em dashes.

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Copy .env.local.example to .env.local and fill in the Supabase keys.',
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-side Supabase access for read-only views. Kept out of client bundles
// by the server-only import. The engine reads coverage and cash views, so an
// anon or service-role key both work depending on your RLS setup.

function readEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

/** True when the Supabase environment is wired up. */
export function isSupabaseConfigured(): boolean {
  return readEnv() !== null;
}

/** A configured client, or null when the environment is not set. */
export function getServerClient(): SupabaseClient | null {
  const env = readEnv();
  if (!env) return null;
  return createClient(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

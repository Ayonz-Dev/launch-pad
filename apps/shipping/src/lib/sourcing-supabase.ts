import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Service-role client for the Monday catalogue sync and other sourcing scripts.
//
// This is a MACHINE client for background jobs (the sync CLI), not a per-user
// web request path, so it uses the service-role key and does not touch cookies
// or next/headers. Keeping it out of lib/supabase.ts means the sync script has
// no Next.js request-context dependency and can run under plain tsx.
//
// It defaults to the same canonical shared project as the app, but honours the
// SOURCING_* overrides so sourcing can point at a different project or key.
//
// Australian English. No em dashes.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = SupabaseClient<any, any, any>;

let cached: LooseClient | null = null;

export function getSourcingSupabaseServer(): LooseClient {
  if (cached) return cached;

  const url =
    process.env.SOURCING_SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SOURCING_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new Error(
      "Sourcing sync requires SOURCING_SUPABASE_URL and SOURCING_SUPABASE_SERVICE_ROLE_KEY " +
        "(or the main NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: process.env.SOURCING_DB_SCHEMA?.trim() || "public" },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return cached;
}

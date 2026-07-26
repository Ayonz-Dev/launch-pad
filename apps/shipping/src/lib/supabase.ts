import { createServerClient } from "@supabase/ssr";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Two server clients, two jobs.
//
// getSupabaseServer()  - the PER-USER client. Built from the signed-in session
//   (anon key + auth cookies), so every read and user-initiated write runs as
//   that person and the visibility schema's RLS (iam_private.authorized) decides
//   what they can see and change. This is the default the app reads through.
//
// getSupabaseServiceRole() - the MACHINE client. Service role key, bypasses
//   RLS. Used ONLY by the ingest endpoint, which n8n or a carrier push calls
//   with a shared secret and which has no user session to run as.
//
// Never import either from client code; the keys and cookies are server only.
// Schema is chosen at runtime ("public" | "visibility"), so keep the types loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = SupabaseClient<any, any, any>;

function dbSchema(): string {
  return process.env.SUPABASE_DB_SCHEMA?.trim() || "public";
}

function requireUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL (and the anon key), or use DATA_SOURCE=mock.",
    );
  }
  return url;
}

// Next caches fetch() GETs by default; force no-store so a first empty read does
// not get pinned and leave the dashboard blank after data lands.
const noStoreFetch = (input: RequestInfo | URL, init?: RequestInit) =>
  fetch(input, { ...init, cache: "no-store" });

/**
 * The per-user server client. Reads the auth cookies for the signed-in session
 * so RLS applies. This is what getShipments and the user write paths use.
 */
export function getSupabaseServer(): LooseClient {
  const url = requireUrl();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!anon) {
    throw new Error(
      "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_ANON_KEY, or use DATA_SOURCE=mock.",
    );
  }

  const cookieStore = cookies();
  return createServerClient(url, anon, {
    db: { schema: dbSchema() },
    global: { fetch: noStoreFetch },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Read-only cookie context (server component). The middleware handles
          // session rotation, so this is safe to ignore.
        }
      },
    },
  }) as unknown as LooseClient;
}

let serviceCached: LooseClient | null = null;
let serviceCachedSchema: string | null = null;

/**
 * The machine client, service role, RLS-bypassing. ONLY for the ingest route,
 * which authenticates with a shared secret rather than a user session.
 */
export function getSupabaseServiceRole(): LooseClient {
  const schema = dbSchema();
  if (serviceCached && serviceCachedSchema === schema) return serviceCached;

  const url = requireUrl();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!service) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for machine ingest. Set it, or disable the ingest route.",
    );
  }

  serviceCached = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema },
    global: { fetch: noStoreFetch },
  });
  serviceCachedSchema = schema;
  return serviceCached;
}

/** Whether the service-role key is configured (never the secret itself). */
export function getSupabaseKeyKind():
  | "service_role"
  | "unconfigured" {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    ? "service_role"
    : "unconfigured";
}

/**
 * Org that imported / ingested shipments belong to (shared IAM org UUID). Under
 * per-user auth this should match the signed-in user's organisation; RLS rejects
 * a write that does not. Kept as an env for the machine ingest path, which has
 * no user to derive the org from.
 */
export function getVisibilityOrganizationId(): string | null {
  return process.env.VISIBILITY_ORGANIZATION_ID?.trim() || null;
}

export function requireVisibilityOrganizationId(): string {
  const id = getVisibilityOrganizationId();
  if (!id) {
    throw new Error(
      "VISIBILITY_ORGANIZATION_ID is required when writing to the visibility schema. Use the org UUID from costing-app /setup.",
    );
  }
  return id;
}

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

function requireUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  return url;
}

/** Service-role client for server routes. Never import from browser code. */
export function getServiceSupabase(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("The service-role Supabase client is server-only.");
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for catalogue and purchase-order routes.",
    );
  }
  return createClient(requireUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

export class AuthError extends Error {
  status = 401;
  constructor(message = "Sign in required.") {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Validate the signed-in user from an Authorization: Bearer <access_token> header.
 * Uses the publishable key so the token is checked against Auth, not the service role.
 */
export async function requireAuthenticatedUser(req: Request): Promise<User> {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    throw new AuthError();
  }
  const token = header.slice(7).trim();
  if (!token) throw new AuthError();

  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!publishable) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not configured.");
  }

  const authClient = createClient(requireUrl(), publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new AuthError();
  return data.user;
}

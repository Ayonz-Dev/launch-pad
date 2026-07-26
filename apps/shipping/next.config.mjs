/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Consume the shared workspace packages as TypeScript source (see DECISIONS D2).
  transpilePackages: ['@launchpad/db', '@launchpad/auth', '@launchpad/shell'],
};

// Surface a clear boot warning when the ingest service secret is missing while
// running against Supabase. Machine ingest needs the service role key; user
// facing reads use the signed-in session and RLS, so they do not.
if (
  process.env.DATA_SOURCE === 'supabase' &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  console.warn(
    '[shipping] DATA_SOURCE=supabase but SUPABASE_SERVICE_ROLE_KEY is not set. ' +
      'User reads still work through the session and RLS; the machine ingest route (/api/ingest) will not.',
  );
}

export default nextConfig;

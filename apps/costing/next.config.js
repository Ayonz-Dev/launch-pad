/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Consume the shared workspace packages as TypeScript source. No separate
  // build step for them; Next transpiles them here. See DECISIONS.md D2.
  transpilePackages: ['@launchpad/db', '@launchpad/auth'],
};

module.exports = nextConfig;

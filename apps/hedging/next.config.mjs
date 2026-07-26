/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Consume the shared workspace packages as TypeScript source (see DECISIONS D2).
  transpilePackages: ['@launchpad/db', '@launchpad/auth', '@launchpad/shell'],
};

export default nextConfig;

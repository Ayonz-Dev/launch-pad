/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@launchpad/db', '@launchpad/auth', '@launchpad/shell'],
};

module.exports = nextConfig;

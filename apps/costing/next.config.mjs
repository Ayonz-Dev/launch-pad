/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // src/lib/zipReplace.ts uses the browser CompressionStream API and only
      // falls back to node:zlib via a guarded dynamic import when that API is
      // absent (never, in a browser). Next 14's webpack cannot parse the node:
      // scheme even on the dead branch, so ignore that request for the client
      // build. The fallback code path is never reached in the browser.
      config.plugins.push(
        new webpack.IgnorePlugin({ resourceRegExp: /^node:zlib$/ }),
      );
    }
    return config;
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Workspace packages export TS source directly; Next must transpile them.
  transpilePackages: [
    '@hamafx/shared',
    '@hamafx/db',
    '@hamafx/data',
    '@hamafx/indicators',
    '@hamafx/ai',
    '@hamafx/config',
  ],

  // Type-checking + linting are run separately in CI; don't block the build.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  // Stricter security headers — see docs/12-security-and-config.md.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=()',
          },
        ],
      },
      // The service worker must never be cached by the browser HTTP cache —
      // otherwise updated workers won't propagate within Phase 1's update
      // window. `Service-Worker-Allowed: /` lets us register at root scope
      // even though the file is served from `/sw.js` (no scope-setting
      // header is strictly required at root, but it's explicit + future-proof).
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },

  experimental: {
    // Larger body for chat tool-result payloads.
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;

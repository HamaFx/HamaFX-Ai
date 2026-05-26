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
    ];
  },

  experimental: {
    // Larger body for chat tool-result payloads.
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;

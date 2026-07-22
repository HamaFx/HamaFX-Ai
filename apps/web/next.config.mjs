import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',

  reactStrictMode: true,

  transpilePackages: [
    '@hamafx/shared',
    '@hamafx/db',
    '@hamafx/data',
    '@hamafx/indicators',
    '@hamafx/ai',
    '@hamafx/config',
  ],

  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.in',
      },
    ],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // M-7: Additional security headers
          // M-7: HSTS — 1 year, no preload/subdomains initially.
          // Self-hosters can harden further once HTTPS is confirmed stable.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            // C-3: Baseline CSP (static fallback). The production CSP with
            // per-request nonces is set dynamically in middleware.ts and
            // overrides this header. This static CSP serves as a fallback
            // for requests that bypass middleware.
            // - 'unsafe-eval' REMOVED — blocks arbitrary code execution.
            // - 'strict-dynamic' ADDED — trust propagation from nonce'd scripts.
            // - 'unsafe-inline' retained: Next.js App Router injects inline
            //   <script> tags for hydration that cannot pick up per-request
            //   nonces without framework-level support. The middleware CSP
            //   adds 'nonce-{value}' alongside 'unsafe-inline' for full coverage.
            // L-4: Tightened img-src and connect-src from wildcards to known
            // domains: Supabase Storage, TradingView CDN, and Vercel analytics.
            // The middleware CSP (with nonce) also uses these directives.
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'strict-dynamic' https://s3.tradingview.com; style-src 'self' 'unsafe-inline' https://s3.tradingview.com; img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://s3.tradingview.com https://api.dicebear.com; font-src 'self' data:; connect-src 'self' wss: https://*.supabase.co https://*.biquote.io https://*.binance.com https://api.resend.com https://*.nowpayments.io https://*.tradingview.com https://api.dicebear.com;",
          },
        ],
      },
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
    optimizePackageImports: ['@tabler/icons-react', 'motion', 'react-markdown', 'dompurify'],
    serverActions: { bodySizeLimit: '2mb' },
  },

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : undefined,
  },
};

import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  silent: !process.env.CI,
});

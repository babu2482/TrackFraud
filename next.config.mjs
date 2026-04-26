/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  // ── Build ──────────────────────────────────────────────────────────
  output: 'standalone',

  // Enable gzip/Brotli compression
  compress: true,

  // Remove X-Powered-By header
  poweredByHeader: false,

  // ── ESLint / TypeScript ────────────────────────────────────────────
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },

  // ── Images ─────────────────────────────────────────────────────────
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 768, 1024, 1200, 1536, 1920],
    minimumCacheTTL: 60,
  },

  // ── Security Headers ───────────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // X-XSS-Protection removed: OWASP recommends against it; CSP handles XSS protection
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.sentry.io;",
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          ...(isProd
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
        ],
      },
      // API routes: no caching
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
        ],
      },
      // Static assets: long caching
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // ── Redirects ──────────────────────────────────────────────────────
  async redirects() {
    return [];
  },

  // ── Rewrites ───────────────────────────────────────────────────────
  async rewrites() {
    return [];
  },

  // ── Server External Packages ───────────────────────────────────────
  serverExternalPackages: ['@prisma/client'],

  // ── Logging ────────────────────────────────────────────────────────
  logging: {
    fetches: {
      fullUrl: !isProd,
    },
  },
};

export default nextConfig;
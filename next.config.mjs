/** @type {import('next').NextConfig} */
// eslint-disable-next-line no-undef
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  // ── Build ──────────────────────────────────────────────────────────
  output: "standalone",

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
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 768, 1024, 1200, 1536, 1920],
    minimumCacheTTL: 60,
  },

  // ── Transpile Packages ────────────────────────────────────────────
  // react-simple-maps and its deps use Node.js built-ins that need transpilation
  transpilePackages: [
    "react-simple-maps",
    "d3-geo",
    "d3-scale",
    "d3-array",
    "d3-interpolate",
    "d3-color",
    "topoclient",
    "topojson-client",
  ],

  // ── Webpack Configuration ─────────────────────────────────────────
  webpack: (config, { isServer }) => {
    // Polyfill Node.js built-ins for client-side bundling
    // react-simple-maps depends on d3 packages that reference fs/path
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
      };
    }

    return config;
  },

  // ── Security Headers ───────────────────────────────────────────────
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // X-XSS-Protection removed: OWASP recommends against it; CSP handles XSS protection
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.sentry.io https://cdn.jsdelivr.net;",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          ...(isProd
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
      // API routes: default no-caching for mutable data
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
        ],
      },
      // Public read-only APIs: CDN cache with stale-while-revalidate
      // These serve data that changes infrequently and benefits from caching
      {
        source: "/api/categories",
        headers: [
          {
            key: "Cache-Control",
            value:
              "public, max-age=3600, s-maxage=86400, stale-while-revalidate=60",
          },
        ],
      },
      // Search results: short CDN cache (search is fast, but caching helps under load)
      {
        source: "/api/search",
        headers: [
          {
            key: "Cache-Control",
            value:
              "public, max-age=60, s-maxage=300, stale-while-revalidate=30",
          },
        ],
      },
      // Fraud scores: moderate cache (scores change on scoring runs, not every request)
      {
        source: "/api/fraud-scores",
        headers: [
          {
            key: "Cache-Control",
            value:
              "public, max-age=300, s-maxage=1800, stale-while-revalidate=60",
          },
        ],
      },
      // Health/metrics endpoints: no cache (always fresh)
      {
        source: "/api/health",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache",
          },
        ],
      },
      {
        source: "/api/metrics",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache",
          },
        ],
      },
      // Static assets: long caching
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
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
  serverExternalPackages: ["@prisma/client"],

  // ── Logging ────────────────────────────────────────────────────────
  logging: {
    fetches: {
      fullUrl: !isProd,
    },
  },
};

export default nextConfig;

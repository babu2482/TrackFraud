/**
 * Edge Middleware for TrackFraud
 *
 * Runs on every request before reaching route handlers.
 * Provides: rate limiting, CORS, security headers, request sanitization.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─── Paths to skip middleware ─────────────────────────────────────────

const BYPASS_PATHS = [
  '/api/health',
  '/_next/static',
  '/_next/image',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.json',
];

function shouldBypass(pathname: string): boolean {
  return BYPASS_PATHS.some((p) => pathname.startsWith(p));
}

// ─── Rate Limiting (in-memory for edge, Redis in API routes) ──────────

// Simple edge-rate limiter using a Map (per-worker, not shared)
const edgeRateLimitMap = new Map<string, { count: number; reset: number }>();
const EDGE_RATE_LIMIT = 200; // requests per minute per IP (generous edge limit)
const EDGE_WINDOW_MS = 60_000;

function checkEdgeRateLimit(ip: string): { allowed: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const key = `${ip}`;
  const entry = edgeRateLimitMap.get(key);

  if (!entry || now > entry.reset) {
    edgeRateLimitMap.set(key, { count: 1, reset: now + EDGE_WINDOW_MS });
    return { allowed: true, remaining: EDGE_RATE_LIMIT - 1, reset: now + EDGE_WINDOW_MS };
  }

  entry.count++;

  if (entry.count > EDGE_RATE_LIMIT) {
    return { allowed: false, remaining: 0, reset: entry.reset };
  }

  return { allowed: true, remaining: EDGE_RATE_LIMIT - entry.count, reset: entry.reset };
}

// ─── CORS Configuration ───────────────────────────────────────────────

function getCorsOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  const allowed = process.env.CORS_ORIGINS || 'http://localhost:3001';
  const origins = allowed.split(',').map((s) => s.trim());

  if (origin && origins.includes(origin)) {
    return origin;
  }
  return null;
}

function addCorsHeaders(response: NextResponse, origin: string | null): void {
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Request-ID'
  );
  response.headers.set('Access-Control-Max-Age', '86400');
}

// ─── Request Sanitization ─────────────────────────────────────────────

// Block obvious injection patterns in query parameters
function isSuspiciousRequest(request: NextRequest): boolean {
  const url = request.url.toLowerCase();
  const suspiciousPatterns = [
    '<script',
    'javascript:',
    'onerror=',
    'onload=',
    '../',
    '..\\',
    '/etc/passwd',
    'union+select',
    'union%20select',
    "' or '1'='1",
  ];

  return suspiciousPatterns.some((pattern) => url.includes(pattern));
}

// ─── Main Middleware ──────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Bypass static assets and health checks
  if (shouldBypass(pathname)) {
    return NextResponse.next();
  }

  // 2. Handle CORS preflight
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    const origin = getCorsOrigin(request);
    addCorsHeaders(response, origin);
    return response;
  }

  // 3. Request sanitization
  if (isSuspiciousRequest(request)) {
    return new NextResponse(
      JSON.stringify({ error: 'Bad Request', message: 'Suspicious request detected' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // 4. Rate limiting for API routes
  if (pathname.startsWith('/api/')) {
    const ip =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const { allowed, remaining, reset } = checkEdgeRateLimit(ip);

    if (!allowed) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000);
      const response = new NextResponse(
        JSON.stringify({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter,
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      response.headers.set('Retry-After', String(retryAfter));
      response.headers.set('X-RateLimit-Remaining', '0');
      response.headers.set('X-RateLimit-Limit', String(EDGE_RATE_LIMIT));
      response.headers.set('X-RateLimit-Reset', String(Math.floor(reset / 1000)));
      return response;
    }

    // Add rate limit headers to the response
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', String(EDGE_RATE_LIMIT));
    response.headers.set('X-RateLimit-Remaining', String(remaining));
    response.headers.set('X-RateLimit-Reset', String(Math.floor(reset / 1000)));

    // Add CORS to API responses
    const origin = getCorsOrigin(request);
    addCorsHeaders(response, origin);

    return response;
  }

  // 5. Add CORS to all other responses
  const response = NextResponse.next();
  const origin = getCorsOrigin(request);
  addCorsHeaders(response, origin);

  return response;
}

// ─── Matcher Configuration ────────────────────────────────────────────

export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
    // Match search page
    '/search/:path*',
    // Match main pages
    '/',
    // Match category pages
    '/charities/:path*',
    '/corporate/:path*',
    '/government/:path*',
    '/political/:path*',
    '/healthcare/:path*',
    '/consumer/:path*',
  ],
};
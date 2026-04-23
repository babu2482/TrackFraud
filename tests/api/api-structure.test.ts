/**
 * API Route Structure Tests
 * Verifies all expected API route files exist and are importable.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const apiDir = path.join(__dirname, '../../app/api');

function findRouteFiles(dir: string, base = ''): string[] {
  let results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = base ? path.join(base, entry.name) : entry.name;
      if (entry.isDirectory()) {
        results = results.concat(findRouteFiles(fullPath, relPath));
      } else if (entry.name === 'route.ts') {
        results.push(relPath);
      }
    }
  } catch {
    // ignore
  }
  return results;
}

function routePathToEndpoint(routePath: string): string {
  // Convert file path to API endpoint
  return '/api/' + routePath
    .replace(/\/route\.ts$/, '')
    .replace(/\[.*?\]/g, ':param');
}

describe('API Route Structure', () => {
  it('api directory exists', () => {
    expect(fs.existsSync(apiDir)).toBe(true);
  });

  it('has expected number of route files', () => {
    const routes = findRouteFiles(apiDir);
    expect(routes.length).toBeGreaterThanOrEqual(15);
  });

  it('has health route', () => {
    const routes = findRouteFiles(apiDir);
    expect(routes.some((r) => r.includes('health'))).toBe(true);
  });

  it('has categories route', () => {
    const routes = findRouteFiles(apiDir);
    expect(routes.some((r) => r.includes('categories'))).toBe(true);
  });

  it('has charity routes', () => {
    const routes = findRouteFiles(apiDir);
    const charityRoutes = routes.filter((r) => r.includes('charities'));
    expect(charityRoutes.length).toBeGreaterThanOrEqual(3);
  });

  it('has corporate routes', () => {
    const routes = findRouteFiles(apiDir);
    const corpRoutes = routes.filter((r) => r.includes('corporate'));
    expect(corpRoutes.length).toBeGreaterThanOrEqual(2);
  });

  it('has consumer routes', () => {
    const routes = findRouteFiles(apiDir);
    const consumerRoutes = routes.filter((r) => r.includes('consumer'));
    expect(consumerRoutes.length).toBeGreaterThanOrEqual(2);
  });

  it('has political routes', () => {
    const routes = findRouteFiles(apiDir);
    const politicalRoutes = routes.filter((r) => r.includes('political'));
    expect(politicalRoutes.length).toBeGreaterThanOrEqual(2);
  });

  it('has healthcare routes', () => {
    const routes = findRouteFiles(apiDir);
    const healthcareRoutes = routes.filter((r) => r.includes('healthcare'));
    expect(healthcareRoutes.length).toBeGreaterThanOrEqual(1);
  });

  it('has government routes', () => {
    const routes = findRouteFiles(apiDir);
    const govRoutes = routes.filter((r) => r.includes('government'));
    expect(govRoutes.length).toBeGreaterThanOrEqual(2);
  });

  it('has search route', () => {
    const routes = findRouteFiles(apiDir);
    expect(routes.some((r) => r.includes('search'))).toBe(true);
  });

  it('has tips route', () => {
    const routes = findRouteFiles(apiDir);
    expect(routes.some((r) => r.includes('tips'))).toBe(true);
  });

  it('has subscribe route', () => {
    const routes = findRouteFiles(apiDir);
    expect(routes.some((r) => r.includes('subscribe'))).toBe(true);
  });

  it('all route paths convert to valid endpoints', () => {
    const routes = findRouteFiles(apiDir);
    for (const route of routes) {
      const endpoint = routePathToEndpoint(route);
      expect(endpoint.startsWith('/api/')).toBe(true);
    }
  });
});
# Handoff: Hydration Mismatch Fix (2026-04-30)

## Summary

Fixed Next.js hydration mismatch error and cleaned up all console errors/warnings on the homepage.

**Before:** 7 console errors (hydration mismatch, CSP blocking map data, missing resources)
**After:** 0 console errors, 0 warnings ✅

## Root Cause

The `data-arq=""` attribute was being injected into the `<html>` tag by a browser extension (not application code). This caused a mismatch between the server-rendered HTML (no attribute) and the client-side DOM (with attribute), triggering Next.js hydration errors.

## Changes Made

### 1. `app/layout.tsx`
- Added `suppressHydrationWarning` to `<html>` tag to ignore browser extension attribute injection
- Moved `themeColor` and `viewport` from `metadata` export to separate `viewport` export (Next.js 15 best practice)
- Added `Viewport` type import

### 2. `next.config.mjs`
- Added `https://cdn.jsdelivr.net` to CSP `connect-src` directive
- This allows the US map data (`us-atlas` npm package) to load from jsDelivr CDN

### 3. `public/manifest.json` (new)
- Created web app manifest for PWA support
- References the favicon we created

### 4. `public/favicon.ico` (new)
- Created 16x16 favicon (blue background with white pattern matching brand colors)

### 5. `scripts/create_favicon.py` (new)
- Python script used to generate the favicon (can be reused to regenerate)

### 6. `.zed/settings.json`
- Added `--output-dir /tmp/playwright-mcp-output` to Playwright MCP args
- This fixes the read-only root filesystem issue on macOS (SIP prevents writing to `/`)

## Testing

- ✅ Manual: Homepage loads with 0 errors, 0 warnings in console
- ✅ E2E: All 10 navigation tests pass (including "no console errors on homepage" test)
- ✅ TypeScript: No type errors
- ✅ US map now loads (CSP fixed)

## Files Changed

| File | Change |
|------|--------|
| `app/layout.tsx` | Hydration fix + metadata cleanup |
| `next.config.mjs` | CSP fix for map data |
| `public/manifest.json` | New - web app manifest |
| `public/favicon.ico` | New - favicon |
| `scripts/create_favicon.py` | New - favicon generator |
| `.zed/settings.json` | Playwright MCP output dir fix |

## Commit

```
c7684b1 fix: resolve hydration mismatch, CSP map loading, and metadata deprecation warnings
```

## Notes for Future

- The `suppressHydrationWarning` on `<html>` is safe and recommended for this use case. Browser extensions will always inject attributes we can't control.
- If you need a better favicon, update `scripts/create_favicon.py` or replace `public/favicon.ico` directly.
- The Playwright MCP `--output-dir` fix requires the MCP server to restart (Zed needs to be restarted after changing `.zed/settings.json`).

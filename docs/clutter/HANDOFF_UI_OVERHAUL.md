# UI/UX Overhaul Handoff

> **Date:** 2026-04-30
> **Status:** Phase 1-5 Complete
> **Build:** Compiles successfully, all pages generated

---

## Summary

Complete UI/UX overhaul of the TrackFraud platform. Eliminated dark mode (dark only), replaced all emoji with SVG icons, rewrote the landing page with FraudMap as the centerpiece, added animated background, intelligent autocomplete search, simplified footer, and streamlined the navbar.

---

## What Was Done

### New Files Created
- `components/ui/Icons.tsx` — SVG icon library (Heart, Building, Landmark, Hospital, Vote, Shield, Search, X, Menu, ChevronDown, ChevronRight, Filter, ArrowUp, Activity, Database, AlertTriangle, MapPin, Github, Send)
- `components/ui/AnimatedBackground.tsx` — Canvas particle network animation for landing page
- `components/ui/DataSourcesMarquee.tsx` — Auto-scrolling data sources strip
- `components/search/AutocompleteDropdown.tsx` — Rich autocomplete with entity type, location, risk score

### Files Completely Rewritten
- `app/page.tsx` — Landing page: Hero search + FraudMap centerpiece + stats ticker + data sources marquee + CTA
- `components/layout/Navbar.tsx` — Slim 40px, transparent on home, no dark mode toggle, clean category nav
- `components/layout/Footer.tsx` — Minimal centered design, single column, inline data sources
- `components/layout/ClientLayout.tsx` — Dark theme wrapper with animated background on home
- `components/layout/Sidebar.tsx` — Dark-only, no emoji, clean dot indicators
- `app/globals.css` — Dark theme tokens only, removed all light mode / `dark:` variants
- `tailwind.config.ts` — Removed `darkMode: "class"`

### Files Modified
- `components/FraudMap.tsx` — Always `isDark = true`, dark-only styling, no emoji icons, simplified dark detection
- `components/layout/MainLayout.tsx` — Dark background only
- `docs/plans/UI_OVERHAUL_PLAN.md` — Implementation plan document

### Key Design Decisions
1. **Dark only** — Removed dark/light toggle. Platform is a data intelligence tool, dark is the standard.
2. **FraudMap as hero** — The heatmap is the centerpiece. Users see it immediately on landing.
3. **No emoji** — All emoji replaced with SVG icons from lucide-inspired Icon library.
4. **Animated background** — Canvas particle network, respects prefers-reduced-motion.
5. **Minimal footer** — Centered, essential links only, data sources inline.
6. **Slim navbar** — 40px height, transparent on landing, solidifies on scroll.

---

## What Still Needs Work

### Phase 3 Partial: Autocomplete Integration
- `AutocompleteDropdown.tsx` component exists but is NOT yet wired into the hero search
- The hero search on landing page uses a simple form action
- Need to create a client-side hero search component that integrates the autocomplete dropdown
- The `/api/search` endpoint already supports rich results

### Phase 6 Partial: Category Icons in DB
- `lib/categories.ts` still stores emoji in the `icon` field
- The `CategoryIcon` component maps icon names to SVGs but isn't used everywhere
- Database `iconName` field exists but many entries may be null
- Full migration: Update all category configs to use `iconName` from the Icons library

### Phase 7: Responsive Polish
- Landing page needs testing at 375px, 768px, 1440px+ breakpoints
- FraudMap may need mobile-specific simplification
- Stats ticker wraps on small screens but could be horizontally scrollable

### Phase 8: E2E Testing
- No Playwright tests written for the new UI
- Need tests for: landing page renders, search works, map interaction, footer links

### Other Known Issues
- Some `dark:` Tailwind classes remain in files not yet updated (search pages, entity detail pages, etc.)
- The `FraudMap` component has extensive dark mode styling that could be cleaned up further
- Category config in `lib/categories.ts` still uses emoji — needs full migration to SVG icons

---

## Build Verification

```
✓ Compiled successfully in 3.1s
✓ Generating static pages (56/56)
```

All 56 pages compile and generate without type errors.

---

## Files Changed Summary

| File | Action | Lines |
|------|--------|-------|
| `components/ui/Icons.tsx` | Created | ~440 |
| `components/ui/AnimatedBackground.tsx` | Created | ~155 |
| `components/ui/DataSourcesMarquee.tsx` | Created | ~109 |
| `components/search/AutocompleteDropdown.tsx` | Created | ~270 |
| `app/page.tsx` | Rewritten | ~230 |
| `components/layout/Navbar.tsx` | Rewritten | ~280 |
| `components/layout/Footer.tsx` | Rewritten | ~110 |
| `components/layout/ClientLayout.tsx` | Modified | ~40 |
| `components/layout/Sidebar.tsx` | Rewritten | ~280 |
| `app/globals.css` | Rewritten | ~230 |
| `tailwind.config.ts` | Modified | -darkMode |
| `components/FraudMap.tsx` | Modified | Simplified dark mode |
| `components/layout/MainLayout.tsx` | Modified | Dark only |

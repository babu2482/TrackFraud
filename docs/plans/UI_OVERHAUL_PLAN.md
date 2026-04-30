# TrackFraud UI/UX Overhaul Plan

> **Date:** 2026-04-30
> **Status:** Planning
> **Priority:** Critical — Current UI undermines platform credibility

---

## Mission Statement

TrackFraud is a mission-driven platform for financial transparency and fraud tracking. Every pixel must serve that mission. The UI must feel authoritative, data-rich, and purposeful. No decorative elements. No emoji. No filler sections. Users should feel the weight of 2M+ entities being tracked in real-time.

---

## Current Problems

### 1. Hero Section — Generic, Wasted Space
- Massive headline takes up viewport but delivers no data value
- Search bar buried under marketing copy
- "Live Data" badge is cute but small
- No immediate visual proof of the platform's power
- Emoji in search button

### 2. Stats Bar — Underrated Asset
- 6 data points crammed into small cards
- These numbers ARE the story but feel like an afterthought

### 3. FraudMap / Heatmap — Hidden Gem
- The US heatmap showing fraud by state is the CENTERPIECE
- Currently lives on a separate page, not visible on landing

### 4. "Explore by Category" — Filler
- 6 cards with emoji icons repeating what the navbar already shows
- No unique value, just takes up vertical space

### 5. Footer — Bloat
- 5-column layout with repetitive links
- "Submit a Tip" appears twice
- Duplicate category links

### 6. Dark Mode Toggle — Distraction
- Pick one: Dark mode. This is a data intelligence platform.

### 7. Background — Static, Boring
- Needs to feel alive, data-driven, mesmerizing

### 8. Search — No Autocomplete
- API already supports autocomplete but frontend doesn't use it

---

## Design Philosophy

**"Data First, Interface Second"**

- The data is the hero. The UI is a window into the data.
- Dark theme only. Consistent, focused, serious.
- SVG icons everywhere. No emoji. Ever.
- Animated background that suggests data flowing, networks connecting.
- FraudMap visible immediately. Users interact with it before reading anything.

---

## Implementation Phases

### Phase 1: Foundation
- Kill dark mode support across all files
- Animated background component (canvas particle network)
- SVG icon system to replace all emoji

### Phase 2: Landing Page Rewrite
- FraudMap as hero, full-viewport centerpiece
- Search bar floating over the map
- Stats as compact scrolling ticker
- Data sources as horizontal marquee strip
- Single CTA section for tip submission

### Phase 3: Search Autocomplete
- Rich autocomplete dropdown with entity type, location, risk score
- Keyboard navigation
- Hero search + navbar search both get autocomplete

### Phase 4: Navbar Overhaul
- Slimmer, transparent, blurred background
- Remove dark mode toggle
- Clean category text links
- Search icon + Submit Tip CTA

### Phase 5: Footer Simplification
- Single column, centered
- Essential links only
- Data sources as inline text

### Phase 6: Category Emoji to SVG
- Replace all emoji in category config with SVG components
- Update all rendering code

### Phase 7: Responsive Polish
- Mobile, tablet, desktop breakpoints
- Touch-friendly map interaction

### Phase 8: E2E Testing
- Playwright tests across viewports

---

## Files to Create
- `components/ui/AnimatedBackground.tsx`
- `components/ui/Icons.tsx`
- `components/ui/DataSourcesMarquee.tsx`
- `components/search/AutocompleteDropdown.tsx`

## Files to Modify
- `app/page.tsx` (complete rewrite)
- `app/globals.css` (remove dark mode)
- `tailwind.config.ts` (remove darkMode)
- `components/layout/Navbar.tsx`
- `components/layout/Footer.tsx`
- `components/layout/ClientLayout.tsx`
- `components/search/SearchBar.tsx`
- `components/FraudMap.tsx`
- `lib/categories.ts`
- `app/api/search/route.ts`

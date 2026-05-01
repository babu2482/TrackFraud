# Architecture

TrackFraud uses a single-backend architecture with Next.js 15 handling both the frontend and API layer.

## System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     TrackFraud Platform                      │
├──────────────────────────────────────────────────────────────┤
│  Next.js 15 (App Router + API Routes)                       │
│  - React 19 frontend with SSR/SSG                           │
│  - TypeScript API routes (single backend)                    │
│  - Zod input validation, rate limiting, error boundaries     │
├──────────────────────────────────────────────────────────────┤
│  Prisma ORM → PostgreSQL 16                                 │
│  - 53 models, ~2.4M records                                 │
│  - Charities, Corporate, Government, Political, Healthcare,  │
│    Consumer categories                                       │
├──────────────────────────────────────────────────────────────┤
│  Meilisearch v1.10                                          │
│  - Full-text search across all entities                     │
│  - 6 search indexes                                         │
├──────────────────────────────────────────────────────────────┤
│  Redis 7                                                    │
│  - Caching layer                                            │
└──────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Frontend
| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js | 15.5.15 |
| UI Library | React | 19.1.0 |
| Styling | Tailwind CSS | 3.4.1 |
| Type Safety | TypeScript | 5.9.3 |
| Maps | react-simple-maps | 3.0 |

### Backend
| Layer | Technology | Version |
|-------|------------|---------|
| API | Next.js API Routes | 15.5.15 |
| ORM | Prisma | 6.14.0 |
| Database | PostgreSQL | 16 |
| Validation | Zod | 4.3.6 |

### Data & Search
| Layer | Technology | Version |
|-------|------------|---------|
| Search | Meilisearch | v1.10 |
| Cache | Redis | 7 |
| Ingestion | TypeScript scripts | 30+ scripts |

### DevOps & Quality
| Layer | Technology | Purpose |
|-------|------------|---------|
| Containers | Docker Compose | Service orchestration |
| CI/CD | GitHub Actions | Lint, test, build |
| Error Tracking | Sentry | Production monitoring |
| Testing | Vitest + Playwright | Unit, integration, E2E |
| Linting | ESLint 9 (flat config) | Code quality |

## Data Flow

```
User Request → Next.js API Route → Prisma → PostgreSQL
                                    ↓
                              Meilisearch (search)
                                    ↓
                              Redis (cache)
                                    ↓
                              Sentry (errors)
```

## Key Architectural Decisions

### Single Backend (Next.js Only)

All API routes live in Next.js with Prisma as the single ORM. The previous Python/FastAPI backend was eliminated during the foundation hardening.

**Benefits:**
- Single codebase, single language (TypeScript), single ORM (Prisma)
- Simpler deployment (one service instead of three)
- No cross-language schema drift
- Faster iteration cycles

### Prisma Schema (53 Models)

The schema was pruned from 81 models to 53 by removing 28 legacy/duplicate models. See [DATA_MODELS.md](./DATA_MODELS.md) for details.

### Fraud Scoring (TypeScript)

Fraud scoring runs entirely in TypeScript (`lib/risk-scoring.ts`, `lib/fraud-scoring/`). See [FRAUD_SCORING.md](./FRAUD_SCORING.md) for details.

## API Routes

| Prefix | Purpose |
|--------|---------|
| `/api/charities/*` | Charity fraud data |
| `/api/corporate/*` | Corporate fraud data |
| `/api/government/*` | Government spending data |
| `/api/political/*` | Political transparency data |
| `/api/healthcare/*` | Healthcare fraud data |
| `/api/consumer/*` | Consumer protection data |
| `/api/search` | Full-text search (Meilisearch) |
| `/api/fraud-scores` | Fraud scoring |
| `/api/health` | Health check |

## Security

- **Input validation:** All API routes use Zod schemas
- **Rate limiting:** In-memory sliding window (configurable tiers)
- **Error tracking:** Sentry for production monitoring
- **API keys:** Stored in `.env`, never committed to git
- **Error boundaries:** React error boundaries prevent page crashes

## Directory Structure

```
app/              # Next.js App Router (pages + API routes)
components/       # React components
lib/              # Shared utilities
lib/fraud-scoring/ # Fraud detection and scoring
lib/search/       # Search utilities
prisma/           # Database schema and migrations
scripts/          # Data ingestion scripts
tests/            # Test suite
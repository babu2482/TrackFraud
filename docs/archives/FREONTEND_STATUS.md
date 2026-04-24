# Frontend Status - TrackFraud Platform

Last updated: 2026-04-21

## 🎨 Frontend Architecture

The TrackFraud frontend is a **Next.js 14** application with:
- **App Router** for server/client component architecture
- **Prisma ORM** for database access
- **Tailwind CSS** for styling
- **React Simple Maps** for US fraud heatmap
- **TypeScript** throughout

## ✅ Completed Components

### Core Pages
| Page | Route | Status | Features |
|------|-------|--------|----------|
| Landing Page | `/` | ✅ Enhanced | Live stats, fraud heatmap, category cards, recent activity |
| Charities | `/charities` | ✅ Complete | Search, filters, fraud scores, 990 data |
| Charity Detail | `/charities/[ein]` | ✅ Complete | Financial breakdown, risk signals, peer comparison |
| Corporate | `/corporate` | ✅ Complete | SEC filings search, company profiles |
| Company Detail | `/corporate/company/[cik]` | ✅ Complete | Filings, risk analysis, fraud meter |
| Political | `/political` | ✅ Complete | Candidates, committees, FEC data |
| Government | `/government` | ✅ Complete | USASpending contracts |
| Healthcare | `/healthcare` | ✅ Complete | CMS Open Payments, Sunshine Act data |
| Consumer | `/consumer` | ✅ Complete | CFPB complaints |
| Unified Search | `/search` | ✅ Complete | Cross-category search |
| Admin Dashboard | `/admin` | ✅ Complete | System monitoring, ingestion status |
| **Data Ingestion Monitor** | `/monitor` | ✅ **NEW** | **Comprehensive ingestion status for all 40+ data sources** |

### UI Components
| Component | Location | Purpose |
|-----------|----------|---------|
| FraudMap | `components/FraudMap.tsx` | Interactive US heatmap with fraud visualization |
| IngestionStatus | `components/IngestionStatus.tsx` | Live ingestion job monitoring |
| IngestionStatusBanner | `components/IngestionStatus.tsx` | Fixed banner showing active ingestion |
| IngestionTimeline | `components/IngestionTimeline.tsx` | **NEW** - Recent ingestion activity timeline |
| FraudMeter | `components/ui/FraudMeter.tsx` | Risk scoring visualization |
| FraudSummary | `components/ui/FraudSummary.tsx` | Cross-category risk indicators |
| Badge | `components/ui/Badge.tsx` | Severity/status badges |
| RiskDetails | `components/ui/RiskDetails.tsx` | Detailed risk signal display |

### API Routes
All category-specific API endpoints:
- `/api/charities/*` - Charity data, search, hottest, peers
- `/api/corporate/*` - Company data, search, flagged
- `/api/political/*` - Bills, candidates, committees
- `/api/government/*` - Awards, search, flagged
- `/api/healthcare/*` - Payments, search
- `/api/consumer/*` - Complaints, search, flagged
- `/api/admin/*` - Stats, jobs, health, fraud metrics
- **`/api/admin/sources`** - **NEW** - All data sources with real-time status
- **`/api/admin/ingestion-history`** - **NEW** - Recent ingestion runs for timeline

## 🆕 Recent Enhancements (2026-04-21)

### 1. Data Ingestion Monitor (`/monitor`)
A comprehensive dashboard showing:
- **All 40+ data sources** in a single view
- **Live status** for each source (running/completed/failed/pending)
- **Record counts** from the database
- **Last sync time** and **hours since sync**
- **Progress bars** for running jobs
- **Error details** for failed jobs
- **Filter by status** (running, completed, never-synced, stale, error)
- **Filter by category**
- **Search** across source names, slugs, and descriptions
- **Expandable cards** showing detailed source information
- **Recent ingestion timeline** at the bottom

### 2. Enhanced API Endpoints
- `/api/admin/sources` - Returns all SourceSystem records with:
  - Record counts from related tables
  - Last successful sync timestamp
  - Current status (derived from IngestionRun)
  - Freshness score (hours since last sync)
  - Active job progress percentages
  - Summary statistics (total sources, fresh, stale, never-synced, active jobs)

- `/api/admin/ingestion-history` - Returns recent ingestion runs with:
  - Source system names
  - Status (running/completed/failed)
  - Rows inserted/updated/failed
  - Duration and timestamps
  - Error summaries

### 3. Missing Ingestion Scripts Created
- `scripts/ingest-cabinet-members.ts` - Cabinet members from presidential administrations
- `scripts/ingest-cms-program-safeguard.ts` - CMS Program Safeguard exclusions

### 4. Updated Ingestion Orchestrator
- Added cabinet-members and cms-program-safeguard to task list
- Updated priorities (cms-program-safeguard: high, cabinet-members: medium)

## 🔄 Current Ingestion Status

### Database Statistics (Live)
| Category | Count |
|----------|-------|
| Charity Profiles | 1,952,238 |
| Corporate Filings | 453,550 |
| FDA Warning Letters | 18,732 |
| FTC Data Breaches | 6,403 |
| OFAC Sanctions | 180 |
| **Total Records** | **2.4M+** |

### Data Sources Summary
- **Total Sources**: 40
- **Fresh** (synced within SLA): 13
- **Stale** (overdue for sync): 4
- **Never Synced**: 35
- **Active Jobs**: 6
- **With Errors**: 3

### Currently Running Jobs
1. **IRS EO BMF** - Charity profiles ingestion
2. **SEC EDGAR** - Corporate filings
3. **CMS Open Payments** - Healthcare payments
4. **FEC API** - Campaign finance data
5. **Congress.gov API** - Bills and votes
6. **CFPB Consumer Complaints** - Consumer complaints

### Recent Completed Jobs
- OFAC Sanctions List (18,732 records updated)
- Federal Register API (80 inserted, 20 updated)
- SAM.gov Exclusions (3 records)
- EPA ECHO Facility Database (3 records)
- Congress.gov API (completed)

### Failed Jobs (Needs Attention)
1. **USAspending API** - "socket hang up" - Network timeout
2. **HHS OIG Exclusions** - "getaddrinfo ENOTFOUND exclusions.hhs.gov" - DNS issue
3. **CFPB Consumer Complaints** - Transaction timeout (long-running batch)

## 🚧 In Progress / TODO

### Phase 1: Frontend Polish
- [x] Add data freshness indicators to category pages
- [x] Connect admin dashboard to real API data
- [x] Create missing ingestion scripts (cabinet-members, cms-program-safeguard)
- [x] Build comprehensive ingestion monitor

### Phase 2: Cross-Category Features
- [ ] Build entity relationship graph component
- [ ] Compute cross-category risk scores
- [ ] Generate fraud snapshots for all entities
- [ ] Create "follow the money" visualization

### Phase 3: Advanced Features
- [ ] Meilisearch integration for faster search
- [ ] Saved searches and alerts
- [ ] Export/reporting functionality
- [ ] Entity timeline view

### Phase 4: Continuous Operation
- [ ] Set up PM2 for background worker
- [ ] Configure cron jobs for scheduled syncs
- [ ] Set up monitoring and alerting
- [ ] Create health check dashboard

## 🛠️ Development Commands

```bash
# Start development server
npm run dev

# Access the Data Ingestion Monitor
open http://localhost:3001/monitor

# Run all ingestion in parallel (background)
nohup npx tsx scripts/ingest-all-parallel.ts --max-concurrent=4 >> logs/ingestion.log 2>&1 &

# Check ingestion progress via API
curl http://localhost:3001/api/admin/sources

# View recent ingestion history
curl http://localhost:3001/api/admin/ingestion-history

# Check running processes
ps aux | grep ingest

# Kill all ingestion processes
pkill -f "tsx scripts/ingest"
```

## 📁 File Structure

```
app/
├── layout.tsx              # Root layout with ingestion banner
├── page.tsx                # Enhanced landing page with live stats
├── monitor/page.tsx        # NEW: Comprehensive ingestion monitor
├── charities/
│   ├── page.tsx           # Charity search/list
│   └── [ein]/page.tsx     # Charity detail
├── corporate/
│   ├── page.tsx           # Corporate search
│   └── company/[cik]/page.tsx  # Company detail
├── political/
│   ├── page.tsx           # Political search
│   ├── candidate/[id]/page.tsx
│   └── committee/[id]/page.tsx
├── government/
│   ├── page.tsx           # Government awards
│   └── award/[id]/page.tsx
├── healthcare/
│   └── page.tsx           # Healthcare payments
├── consumer/
│   └── page.tsx           # Consumer complaints
├── search/
│   └── page.tsx           # Unified search
├── admin/
│   └── page.tsx           # Admin dashboard
└── api/
    └── admin/
        ├── stats/route.ts
        ├── jobs/route.ts
        ├── sources/route.ts        # NEW: All data sources with status
        └── ingestion-history/route.ts  # NEW: Recent runs timeline

components/
├── FraudMap.tsx           # US fraud heatmap
├── IngestionStatus.tsx    # Ingestion monitoring
├── IngestionTimeline.tsx  # NEW: Recent ingestion activity
├── charities/
│   ├── SearchResults.tsx
│   └── HottestList.tsx
└── ui/
    ├── Badge.tsx
    ├── FraudMeter.tsx
    ├── FraudSummary.tsx
    ├── RiskDetails.tsx
    └── StatGrid.tsx

scripts/
├── ingest-all-parallel.ts # Master orchestrator (updated)
├── ingest-cabinet-members.ts  # NEW: Cabinet members ingestion
├── ingest-cms-program-safeguard.ts  # NEW: CMS exclusions
├── ingest-cms-open-payments.ts
├── ingest-fec-summaries.ts
├── ingest-usaspending-bulk.ts
├── ingest-sec-bulk.ts
├── ingest-congress-api.ts
└── ... (30+ more scripts)
```

## 🎯 How to Use the Monitor

1. **Navigate to** `http://localhost:3001/monitor`

2. **View Summary Stats** at the top:
   - Total data sources tracked
   - Fresh sources (within SLA)
   - Stale sources (overdue)
   - Never synced sources
   - Active jobs currently running
   - Total records ingested

3. **Filter Sources**:
   - Search by name, slug, or description
   - Filter by status (running, completed, never-synced, stale, error)
   - Filter by category
   - Sort by name, records, last sync, or freshness

4. **View Details**:
   - Click any source card to expand
   - See slug, category, ingestion mode, cadence
   - View source URL (clickable)
   - See last sync timestamp
   - View error messages if applicable

5. **Monitor Active Jobs**:
   - Blue banner shows currently running jobs
   - Progress bars for jobs with progress data
   - Click to expand for more details

6. **Review Recent Activity**:
   - Scroll to bottom for ingestion timeline
   - See last 50 ingestion runs
   - View inserted/updated/failed counts
   - Identify failed jobs and errors

## 📊 Data Sources Inventory

### Completed (Data Loaded)
- ✅ IRS EO BMF (1.95M charity profiles)
- ✅ SEC EDGAR (453K filings)
- ✅ OFAC Sanctions (18K records)
- ✅ Federal Register (100 documents)
- ✅ FDA Warning Letters (18K records)
- ✅ FTC Data Breaches (6K records)
- ✅ FEC Campaign Finance (44K records)
- ✅ SAM.gov Exclusions (3 records)
- ✅ EPA ECHO Facilities (3 records)

### In Progress (Running)
- 🔄 IRS EO BMF (ongoing)
- 🔄 SEC EDGAR (ongoing)
- 🔄 CMS Open Payments
- 🔄 Congress.gov API
- 🔄 CFPB Consumer Complaints

### Pending (Not Yet Synced)
- ⏸️ Cabinet Members
- ⏸️ CMS Program Safeguard
- ⏸️ HHS OIG Exclusions
- ⏸️ USASpending Awards
- ⏸️ ProPublica Nonprofit
- ⏸️ And 25+ more sources...

---

**Access the monitor at**: `http://localhost:3001/monitor`

**Note**: The ingestion continues running in background. Check `/monitor` for real-time status.
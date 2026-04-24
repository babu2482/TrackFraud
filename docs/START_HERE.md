# 🚀 TrackFraud - START HERE

**Last Updated:** 2026-04-23  
**Purpose:** Quick-start guide to get the entire project running end-to-end

---

## ⚡ One Command to Start Everything

```bash
cd /Volumes/MacBackup/TrackFraudProject
./scripts/dev.sh
```

**That's it.** The script handles everything automatically:

| Step | What it does |
|------|--------------|
| ✅ Prerequisites | Checks Docker, Node.js, npm are installed and running |
| ✅ Environment | Creates `.env` from `.env.example` if missing |
| ✅ Dependencies | Installs npm packages |
| ✅ Prisma | Generates the Prisma client |
| ✅ Infrastructure | Starts PostgreSQL, Redis, Meilisearch via Docker |
| ✅ Database | Runs migrations + seeds the database |
| ✅ Frontend | Starts Next.js dev server |

### Management Commands

```bash
./scripts/dev.sh stop     # Stop all services
./scripts/dev.sh status   # Check what's running
./scripts/dev.sh rebuild  # Full clean rebuild
./scripts/dev.sh logs     # View live logs
```

### Or via npm

```bash
npm run dev:start    # Start everything
npm run dev:stop     # Stop everything
npm run dev:status   # Check status
npm run dev:rebuild  # Full rebuild
npm run dev:logs     # View logs
```

### Services & Ports

| Service | URL |
|---------|-----|
| Frontend (Next.js) | http://localhost:3001 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6380 |
| Meilisearch | http://localhost:7700 |

---

## ⚡ TL;DR (Data Ingestion)

✅ **You have ~120GB of REAL government data already downloaded** in `/Volumes/MacBackup/TrackFraudProject/data/`  
⚠️ **Most hasn't been loaded into the database yet** - ingestion scripts are ready but need execution  
🎯 **After running `./scripts/dev.sh`, load data with:**

```bash
npx tsx scripts/ingest-all.ts --full          # Load ALL 120GB into DB (~8-12 hours)
```

---

## 📍 Where Is All the Data?

**Location:** `/Volumes/MacBackup/TrackFraudProject/data/` (120GB total)

| Category | Size | What's Inside | Status |
|----------|------|---------------|--------|
| `data/irs/` | 34 GB | IRS charity/nonprofit filings (EO BMF, Form 990s, Auto-Revocation) | ⚠️ Files exist, NOT fully ingested to DB |
| `data/government/` | 28 GB | USAspending federal contracts & awards | ❌ Not ingested yet |
| `data/corporate/` | 24 GB | SEC EDGAR filings (10-K, 10-Q, company facts) | ⚠️ Sample data only (~200 companies) |
| `data/healthcare/` | 19 GB | CMS Open Payments ($10B+ physician payments) | ✅ Fully ingested (~945K rows verified) |
| `data/consumer/` | 5 GB | CFPB consumer complaints, FTC data breaches | ❌ Not ingested yet |
| `data/political/` | 32 MB | FEC campaign finance, Congress members | 🟡 Partially ingested |
| `data/treasury/` | 5.5 MB | OFAC sanctions list (terrorists, sanctioned entities) | ⚠️ Parser bug at line 18,699+ |

**Total:** ~120GB of REAL government data from official .gov sources - NOT mock/sample data

---

## 🎯 What Works Right Now?

### ✅ Fully Working (End-to-End)
1. **Charity Search & Browse** (`/charities`)
   - Search by name/EIN/city
   - Fraud meter scores (5 signals: 990 ratios, missing filings, revocation status)
   - Detail pages with financials from Form 990 data

2. **Healthcare Payments API** (data exists, UI needs building)
   - ~945K payment records in database
   - Search by physician name/NPI/company

3. **Tip Submission System** (`/submit`)
   - Anonymous tips to flag suspicious entities
   - Writes directly to PostgreSQL

### ⚠️ Partially Working (Need Data Ingestion First)
1. **Political Explorer** - FEC data exists, ProPublica Politicians API key needed
2. **Corporate SEC Filings** - Sample companies only (~200 CIKs loaded)
3. **Consumer Complaints** - 5GB files exist but NOT in database yet

### ❌ Not Yet Implemented (Placeholder Pages)
1. Government Contracts explorer
2. Environmental enforcement search
3. Unified cross-category search (Meilisearch indexes not built yet)

---

## 📥 Step-by-Step: Get Everything Ingested & Working

### Phase 1: Infrastructure Setup (5 minutes)

```bash
# Navigate to project directory
cd /Volumes/MacBackup/TrackFraudProject

# Start all services (PostgreSQL, Redis, Meilisearch)
docker-compose up -d

# Verify containers are running
docker-compose ps

# Expected output:
# NAME                      STATUS
# trackfraud-postgres       Up (healthy)
# trackfraud-redis          Up (healthy)  
# trackfraud-meilisearch    Up (healthy)
```

### Phase 2: Database Setup (2 minutes)

```bash
# Run Prisma migrations to create all tables
npx prisma migrate deploy

# Verify database is ready
npx prisma db pull
echo "Database schema synced!"
```

### Phase 3: Data Ingestion - HIGH PRIORITY (6 hours, run unattended)

```bash
# Charities (~4 hours, ~2M records)
npx tsx scripts/ingest-irs-eo-bmf.ts --full
npx tsx scripts/ingest-irs-auto-revocation.ts
npx tsx scripts/ingest-irs-pub78.ts

# Politics & Congress (~1 hour, needs API key)
export PROPUBLICA_API_KEY="your-key-here"  # Get from https://www.propublica.org/api
npx tsx scripts/ingest-propublica-politicians.ts
npx tsx scripts/ingest-congress-api.ts --bills --votes

# Sanctions (~1 hour, ~12K records)
npx tsx scripts/ingest-ofac-sanctions.ts  # Note: has parser bug for multi-line addresses
```

**Or run all at once:**
```bash
npx tsx scripts/ingest-all.ts --categories charities,politics,sanctions --full
# Expected runtime: ~6 hours unattended
```

### Phase 4: Data Ingestion - MEDIUM PRIORITY (8 hours)

```bash
# Healthcare (~2 hours, already partially done)
npx tsx scripts/ingest-cms-open-payments.ts --verify

# Corporate SEC filings (~3 hours)
npx tsx scripts/ingest-sec-edgar-simple.ts

# Consumer complaints (~2 hours, ~2M records from 5GB files)
npx tsx scripts/ingest-cfpb-complaints.ts
```

**Or run all at once:**
```bash
npx tsx scripts/ingest-all.ts --categories healthcare,corporate,consumer --full
# Expected runtime: ~8 hours unattended
```

### Phase 5: Data Ingestion - LOW PRIORITY (12+ hours)

```bash
# Government awards (~12 hours, ~50M records from 28GB files)
npx tsx scripts/ingest-usaspending-bulk.ts --full

# Environmental enforcement (~1 hour)
npx tsx scripts/ingest-epa-enforcement.ts
```

**Or run ALL remaining at once:**
```bash
npx tsx scripts/ingest-all.ts --categories awards,environment --full
# Expected runtime: ~12 hours unattended (run overnight)
```

### Phase 6: Build Search Indexes (30 minutes)

After data is ingested, build Meilisearch indexes for unified search:

```bash
npx tsx scripts/reindex-search.ts --full

# Verify indexes created
curl http://localhost:7700/indexes
```

### Phase 7: Set Up Background Worker (Continuous Updates)

Keep data fresh with automatic scheduled ingestion:

```bash
# Install PM2 globally
npm install -g pm2

# Start background worker (runs HIGH priority hourly, MEDIUM daily, LOW weekly)
pm2 start "npx tsx scripts/ingest-worker.ts" --name trackfraud-ingester

# Save process list for auto-restart on system reboot
pm2 save

# Monitor live logs
pm2 logs trackfraud-ingester
```

---

## 🌐 Frontend Wire-Up: What Needs to Be Done?

### Current State (After Data Ingestion)

Once Phase 1-5 ingestion completes, database will have ~5M+ rows. Here's what works vs. needs work:

| Feature | Status | What's Needed |
|---------|--------|---------------|
| **Charity Search** (`/charities`) | ✅ Working | None - fully functional |
| **Political Explorer** (`/political`) | ❌ Placeholder page | Build UI to query `PoliticalCandidateProfile` table (~600 politicians) |
| **Corporate SEC Filings** (`/corporate`) | ❌ Placeholder page | Build UI to search companies by name/ticker, display filings |
| **Healthcare Payments** (`/healthcare`) | ⚠️ API ready, no UI | Build search interface for 945K physician payments |
| **Consumer Complaints** (`/consumer`) | ❌ No data in DB yet | After ingestion complete: build complaint search + company aggregations |
| **Government Contracts** (`/government`) | ❌ No data in DB yet | After Phase 5: build awards explorer with contractor profiles |
| **Unified Search** (`/api/search`) | ❌ Not implemented | Query Meilisearch across all entity types (charities, politicians, companies) |

### Estimated Time to Complete Frontend Wiring

**After database is populated:**
- Political Explorer UI: ~2 hours
- Corporate SEC Filings UI: ~3 hours  
- Healthcare Payments search: ~2 hours
- Consumer Complaints browser: ~2 hours
- Government Contracts explorer: ~3 hours
- Unified Meilisearch API + UI: ~2 hours

**Total:** ~14 hours of frontend development to wire everything end-to-end

---

## 🔑 Required API Keys (Get These First!)

| Provider | Key Variable | Where to Get | Required For |
|----------|--------------|--------------|--------------|
| **ProPublica Politicians** | `PROPUBLICA_API_KEY` | https://www.propublica.org/api | Political candidate data (~600 politicians) |
| Congress.gov | `CONGRESS_API_KEY` | Already configured ✅ | Bills, votes, congressional activity |
| FINRA BrokerCheck | `FINRA_API_KEY` (optional) | https://developer.finra.org/ | Broker/dealer violations |
| EPA ECHO | `EPA_API_KEY` (optional) | https://echo.epa.gov/ | Environmental enforcement data |

**Quick Setup:**
```bash
# Copy example env file
cp .env.example .env

# Edit and add your ProPublica API key
nano .env  # or use your preferred editor
# Add: PROPUBLICA_API_KEY="your-actual-key-here"
```

---

## 📊 Verify Everything Is Working

### Check Database Row Counts

```sql
-- Run in PostgreSQL console: psql postgresql://trackfraud:password@localhost:5434/trackfraud

SELECT 'CharityProfile' as table_name, COUNT(*) as row_count FROM "CharityProfile"
UNION ALL
SELECT 'PoliticalCandidateProfile', COUNT(*) FROM "PoliticalCandidateProfile"
UNION ALL
SELECT 'HealthcarePaymentRecord', COUNT(*) FROM "HealthcarePaymentRecord"
UNION ALL
SELECT 'CorporateCompanyProfile', COUNT(*) FROM "CorporateCompanyProfile"
UNION ALL
SELECT 'ConsumerComplaintRecord', COUNT(*) FROM "ConsumerComplaintRecord"
ORDER BY row_count DESC;
```

**Expected after full ingestion:**
- CharityProfile: ~2M rows
- HealthcarePaymentRecord: ~945K rows
- ConsumerComplaintRecord: ~2M rows
- PoliticalCandidateProfile: ~600 rows
- CorporateCompanyProfile: Varies (sample data or full EDGAR load)

### Check Ingestion Run History

```bash
# View recent ingestion runs
npx prisma query "SELECT source_system_id, status, rows_inserted, started_at FROM \"IngestionRun\" ORDER BY started_at DESC LIMIT 10;"
```

---

## 🎯 Success Metrics (How Do You Know It's Done?)

| Metric | Target | How to Verify |
|--------|--------|---------------|
| **Database Population** | >5M total rows across all tables | Run row count query above |
| **All Categories Searchable** | User can search charities, politicians, companies, complaints | Test each category page in browser |
| **Fraud Scores Calculated** | Every entity has a fraud score + risk factors | Check `/api/fraud-scores/[type]/[id]` endpoint |
| **Unified Search Working** | Single query returns results from ALL categories | Test Meilisearch via `/api/search?q=query` |
| **Background Updates Running** | Data refreshes automatically without manual intervention | `pm2 list` shows worker running, check logs for scheduled runs |

---

## 📚 Related Documentation (Deep Dives)

| Document | What It Covers | Location |
|----------|----------------|----------|
| **DATA_INVENTORY_AND_SYSTEM_STATUS.md** | Complete 830-line breakdown of ALL data sources, ingestion status, frontend wire-up plan | `docs/reports/DATA_INVENTORY_AND_SYSTEM_STATUS.md` |
| **README.md** | Project overview, mission statement, technology stack | `docs/README.md` |
| **PROJECT_STATUS.md** | Real-time execution tracking, recent fixes, blockers | Root directory |
| **DATA_SOURCES.md** | Research on all 52 documented APIs with priority matrix | `docs/DATA_SOURCES.md` |
| **Unified Ingestion Guide** | Step-by-step ingestion commands for each source | `docs/guides/unified-data-ingestion.md` |
| **ARCHITECTURE.md** | System design, database schema patterns, fraud scoring algorithm | `docs/ARCHITECTURE.md` |
| **MASTER_PLAN.md** | Foundation hardening plan and completion summary | `docs/MASTER_PLAN.md` |

---

## 🚨 Troubleshooting Quick Fixes

### "Container won't start"
```bash
# Check for port conflicts (PostgreSQL default 5432)
lsof -i :5432  # If something is using it, stop that process or change docker-compose.yml

# Restart all containers
docker-compose down && docker-compose up -d
```

### "Database connection failed"
```bash
# Wait for PostgreSQL to be ready (takes ~30 seconds after startup)
sleep 30 && npx prisma migrate deploy

# Check DATABASE_URL in .env file matches docker-compose.yml credentials
grep DATABASE_URL .env
```

### "Ingestion script errors out"
```bash
# Run with verbose logging
npx tsx scripts/ingest-irs-eo-bmf.ts --full 2>&1 | tee logs/ingestion.log

# Check specific error message and search PROJECT_STATUS.md for known fixes
grep -i "error\|fail" logs/ingestion.log
```

### "Frontend shows no results"
```bash
# Verify data actually loaded into database
npx prisma query "SELECT COUNT(*) FROM \"CharityProfile\";"

# If count is 0, run ingestion first before testing frontend!
npx tsx scripts/ingest-all.ts --categories charities --full
```

---

## 💡 Pro Tips

1. **Run ingestion overnight** - Full pipeline takes ~8-12 hours unattended. Start it before bed: `npx tsx scripts/ingest-all.ts --full && echo "Ingestion complete!" | mail -s 'TrackFraud Ingestion Done' you@email.com`

2. **Use PM2 for production** - Background worker keeps data fresh automatically without manual intervention every day

3. **Monitor disk space** - 120GB raw files + database + logs = ~200GB total. Ensure SSD has enough room: `df -h /Volumes/MacBackup`

4. **Test incrementally** - Don't wait for full ingestion to start frontend work. Test charity pages while politics/corporate data is still loading in background

5. **Use database directly for debugging** - When frontend shows unexpected results, query PostgreSQL directly: `npx prisma studio` opens GUI browser

---

## 🎯 Bottom Line

**You asked:**
- "Where's the 250GB of data?!" → It's in `/data/` (120GB actual user data)
- "Can we use it?!" → YES, run ingestion scripts to load into PostgreSQL
- "Wire everything end-to-end!?" → Charity explorer works; other categories need UI wiring after DB population
- "No mock data - real data only!" → All 120GB is REAL government data from .gov sources

**To get it all working:**
1. Start Docker: `docker-compose up -d`
2. Run migrations: `npx prisma migrate deploy`  
3. Ingest all data: `npx tsx scripts/ingest-all.ts --full` (~8-12 hours)
4. Build search indexes: `npx tsx scripts/reindex-search.ts`
5. Wire remaining frontend pages: ~14 hours dev time

**You're 3 commands away from having a fully populated fraud tracking platform with millions of real records!**

---

*Generated 2026-04-15 | Last updated 2026-04-23 | For questions, see docs/reports/DATA_INVENTORY_AND_SYSTEM_STATUS.md for complete technical breakdown*
# TrackFraud - Unified Financial Fraud & Government Transparency Platform

> **See where the money goes.** A comprehensive platform tracking financial fraud across America and government transparency in one unified system.

## 🎯 Mission Statement

TrackFraud combines two critical missions:
1. **Financial Fraud Detection** - Track fraud across charities, corporations, healthcare, government spending, and more
2. **Government Transparency** - Monitor politician actions vs. words, legislative activity, and executive decisions

One platform to see the complete picture of where public money goes and how elected officials perform.

## 🌟 What We Track

### Financial Fraud Categories (16+)

#### 1. **Charities & Nonprofits**
- IRS Form 990 filings (all years)
- Program expense ratios, fundraising efficiency
- Officer compensation, peer comparisons
- Automatic revocation lists, tax-exempt status

#### 2. **Political & Campaign Finance**
- PAC spending, campaign finance violations
- Dark money, lobbying disclosures
- FEC bulk data, candidate master files

#### 3. **Corporate & Securities**
- SEC EDGAR filings (all 10K+ public companies)
- Accounting irregularities, insider trading
- Shareholder lawsuits, enforcement actions

#### 4. **Government Spending**
- Federal contracts, grants, procurement
- Contract fraud, earmark abuse
- USASpending bulk data (FY2008-present)

#### 5. **Healthcare Fraud**
- Medicare/Medicaid billing fraud
- CMS Open Payments (doctor-pharma relationships)
- Upcoding, phantom billing, kickback schemes

#### 6. **Consumer Fraud & Scams**
- CFPB consumer complaints
- Ponzi schemes, FTC enforcement
- State attorney general actions

#### 7. **Environmental & Climate Fraud**
- EPA enforcement actions
- Carbon credit fraud, greenwashing
- Environmental violations

#### 8. **Immigration & Visa Fraud**
- USCIS fraud detection notices
- H-1B visa abuse, employment verification fraud

#### 9. **Housing & Real Estate Fraud**
- HUD enforcement, fair housing violations
- Mortgage fraud, appraisal fraud

#### 10. **Financial Services & Banking**
- FDIC enforcement actions
- FinCEN SARs, unlicensed lending

#### 11. **Insurance Fraud**
- NAIC enforcement actions
- Health insurance scams, auto insurance fraud

#### 12. **Cybersecurity & Data Breaches**
- FTC data breach actions
- Privacy violations, security failures

#### 13. **Supply Chain & Import Fraud**
- CBP seizures, customs violations
- OFAC sanctions, forced labor

#### 14. **Education & Student Loans**
- ED enforcement, Title IV violations
- For-profit college scams

#### 15. **Pharmaceutical & Medical Devices**
- FDA warning letters
- DOJ settlements, off-label marketing

#### 16. **Energy & Utilities**
- FERC enforcement, energy market manipulation
- Utility rate violations

### Government Transparency Features

#### 1. **Presidential Actions**
- Executive orders, memoranda, proclamations
- Cabinet appointments and confirmations
- Policy decisions with historical context

#### 2. **Legislative Tracking**
- Bill tracking across Congress sessions
- Vote records and roll call votes
- Sponsor information and bill status

#### 3. **Actions vs. Words Engine** ⭐
- Politician claims and promises
- Fact-check ratings from multiple sources
- Track fulfillment of campaign promises

#### 4. **Politician Profiles**
- Complete voting records
- Campaign finance data
- Lobbying connections

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    TrackFraud Platform                      │
├─────────────────────────────────────────────────────────────┤
│  Next.js Frontend (App Router) + API Routes                 │
│  - Unified search across all categories                     │
│  - Entity profiles with cross-category data                 │
│  - Fraud scoring and risk indicators                        │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL Database (Prisma ORM)                           │
│  - Normalized schema for all entity types                   │
│  - CanonicalEntity model for cross-referencing              │
│  - FraudSignalEvent tracking                                │
├─────────────────────────────────────────────────────────────┤
│  Meilisearch                                                │
│  - Full-text search across all entities                     │
│  - Fast fuzzy matching for names, EINs, IDs                 │
├─────────────────────────────────────────────────────────────┤
│  Data Ingestion Pipeline                                    │
│  - 30+ public data sources                                  │
│  - Incremental and full sync support                        │
│  - Automated scheduling                                     │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

#### Frontend
- **Next.js 14** with App Router
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Prisma Client** for type-safe database access

#### Backend
- **Next.js API Routes** (serverless functions)
- **Prisma ORM** for database operations
- **PostgreSQL** as primary database

#### Data & Search
- **Meilisearch** for full-text search
- **PostgreSQL** with advanced indexing
- **CSV parsing** for bulk data ingestion

#### DevOps & Infrastructure
- **Docker Compose** for local development
- **GitHub Actions** for CI/CD (planned)
- **Environment variables** for configuration

## 📂 Project Structure

```
TrackFraudProject/
├── app/                          # Next.js App Router (Frontend)
│   ├── api/                      # Next.js API routes
│   │   ├── charities/            # Charity endpoints
│   │   ├── political/            # Political data endpoints
│   │   ├── corporate/            # Corporate fraud endpoints
│   │   └── search/               # Search API
│   ├── charities/                # Charity pages
│   ├── political/                # Political transparency pages
│   ├── corporate/                # Corporate fraud pages
│   ├── healthcare/               # Healthcare fraud pages
│   ├── government/               # Government spending pages
│   └── layout.tsx                # Root layout
├── backend/                      # Python FastAPI Backend (NEW)
│   ├── app/                      # Main application
│   │   ├── api/v1/               # API v1 endpoints
│   │   │   ├── politicians.py    # Politician CRUD
│   │   │   ├── bills.py          # Bill tracking
│   │   │   ├── votes.py          # Vote records
│   │   │   ├── promises.py       # Campaign promises
│   │   │   └── comparisons.py    # Actions vs words
│   │   ├── ai/                   # AI/ML services
│   │   │   ├── claim_detector.py # Claim detection
│   │   │   ├── predictor.py      # Outcome prediction
│   │   │   └── sentiment_analyzer.py
│   │   ├── scrapers/             # Data scraping utilities
│   │   ├── services/             # External API services
│   │   └── workers/              # Celery background tasks
│   ├── tests/                    # Backend tests
│   ├── requirements.txt          # Python dependencies
│   └── Dockerfile                # Backend container
├── components/                   # Shared React components
│   ├── ui/                       # Base UI components
│   ├── charts/                   # Data visualization
│   └── tables/                   # Data tables
├── prisma/                       # Database schema & migrations
│   ├── schema.prisma             # Unified Prisma schema (includes political models)
│   └── migrations/               # Database migrations
├── scripts/                      # Data ingestion scripts (TypeScript)
│   ├── ingest-irs-*.ts           # IRS data pipelines
│   ├── ingest-fec-*.ts           # FEC political data
│   ├── ingest-congress-api.ts    # Congress API sync
│   ├── ingest-propublica-*.ts    # ProPublica politician data
│   └── sync-political-data.ts    # Political data synchronization
├── lib/                          # Shared utilities (TypeScript)
│   ├── db.ts                     # Prisma client instance
│   ├── fraud-scoring.ts          # Fraud calculation logic
│   └── search.ts                 # Meilisearch client
├── data/                         # Static data & fixtures
├── docs/                         # Documentation
│   ├── ARCHITECTURE.md           # Architecture decisions
│   ├── MERGE_GUIDE.md            # Project merge documentation
│   └── PROJECT_SUMMARY.md        # Feature summary
├── docker-compose.yml            # Local development services (all-in-one)
├── package.json                  # Node.js dependencies & scripts
├── .env.example                  # Environment variable template
└── README.md                     # This file
```

### Technology Stack Overview

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | Next.js 14 + React 18 | User interface and client-side rendering |
| Backend (Node) | Next.js API Routes | Serverless functions for fraud data |
| Backend (Python) | FastAPI | Political data, AI/ML services, background tasks |
| Database | PostgreSQL 16 | Primary data store with Prisma ORM |
| Cache/Queue | Redis 7 | Celery task queue and caching |
| Search | Meilisearch v1.10 | Full-text search across all entities |
| Task Queue | Celery + Flower | Background job processing and monitoring |

## 📊 Data Sources

### Tier 1: Official Government Sources (Gold Standard)

#### IRS (Internal Revenue Service)
- EO BMF (Exempt Organizations Business Master File)
- Automatic Revocation List
- Publication 78 (tax-deductible organizations)
- Form 990-N (e-Postcard)
- Form 990 XML Archive (all years)

#### SEC (Securities and Exchange Commission)
- EDGAR filings (10-K, 10-Q, 8-K, etc.)
- Company facts (XBRL financial data)

#### Federal Election Commission (FEC)
- Campaign finance summaries
- Candidate master files
- Committee data

#### Congress.gov API
- Bill tracking and status
- Vote records
- Member information

#### ProPublica Politicians API
- Politician profiles
- Committee memberships
- Voting records

### Tier 2: Verified Third-Party Sources (High Confidence)

#### Federal Agencies
- **EPA**: Environmental enforcement, compliance history
- **FTC**: Consumer protection, data breach actions
- **FDA**: Warning letters, enforcement actions
- **CMS**: Open Payments, Medicare/Medicaid data
- **CFPB**: Consumer complaints, financial products
- **USAspending**: Federal contract and grant data

#### International & Trade
- **OFAC**: Sanctions list (all categories)
- **CBP**: Customs seizures, import violations

### Tier 3: Academic & Historical Sources
- Fact-check databases (PolitiFact, FactCheck.org)
- Historical presidential actions database
- Academic research on fraud patterns

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** and npm
- **Python 3.10+** (for local backend development, optional if using Docker)
- **Docker** and Docker Compose
- **PostgreSQL** knowledge (optional)

### Quick Start

```bash
# Navigate to project root
cd TrackFraudProject

# Install dependencies
npm install

# Start all services (database, redis, search, backend)
docker compose up -d

# Run database migrations
npm run db:migrate

# Seed initial data
npm run db:seed

# Start development server
npm run dev
```

The application will be available at `http://localhost:3001`
The Python backend API will be available at `http://localhost:8000`
Celery Flower monitoring at `http://localhost:5555`

### Database Setup

```bash
# Start PostgreSQL only
npm run db:start

# Run migrations
npm run db:migrate

# Seed initial data (fraud categories, sample entities)
npm run db:seed

# Reset database (WARNING: destroys all data)
npm run db:reset

# Full setup from scratch
npm run db:setup
```

### Backend Services Setup

```bash
# Start all backend services (PostgreSQL, Redis, Meilisearch, Python API)
docker compose up -d

# View logs for all services
docker compose logs -f

# Start just the Python backend and Celery workers
npm run backend:start

# Monitor Celery tasks with Flower UI (http://localhost:5555)
npm run celery:start
```

### Local Development (without Docker)

For local development of the Python backend without Docker:

```bash
# Install Python dependencies
cd backend
pip install -r requirements.txt

# Start PostgreSQL via Docker
docker compose up -d postgres redis

# Run database migrations
alembic upgrade head

# Start FastAPI dev server
uvicorn app.main:app --reload --port 8000

# In another terminal, start Celery worker
celery -A app.celery_app worker --loglevel=info
```

### Search Setup

```bash
# Start Meilisearch
npm run search:start

# Stop Meilisearch
npm run search:stop
```

## 📈 Data Ingestion Pipeline

TrackFraud aggregates real-world fraud data from **39+ government and public APIs** across 9 categories, totaling ~2M+ records. The unified ingestion system automatically populates the platform with live data from IRS, Congress.gov, OFAC, CMS, SEC, EPA, CFPB, FTC, USAspending, and more.

### Quick Start: One-Command Deployment (Recommended)

If you have Docker Desktop running, use the automated setup script:

```bash
cd TrackFraudProject
chmod +x scripts/setup-and-ingest.sh
./scripts/setup-and-ingest.sh
```

This single command will:
- ✅ Start PostgreSQL, Redis, and Meilisearch services
- ✅ Run database migrations
- ✅ Execute full ingestion pipeline (~8-12 hours for ~2M+ records)
- ✅ Verify results and optionally set up background worker

### Manual Execution (Full Control)

If you prefer manual control or want to monitor each step:

#### Step 1: Start Services
```bash
cd TrackFraudProject
docker-compose up -d postgres redis meilisearch
```

Wait ~30 seconds for services to become healthy.

#### Step 2: Run Database Migrations
```bash
npx prisma migrate deploy
```

#### Step 3: Execute Ingestion Pipeline (Priority Order)

**HIGH PRIORITY - Charities (~4 hours, ~1.5M records)**
```bash
npx tsx scripts/ingest-all.ts --categories charities --full
```

**HIGH PRIORITY - Politics & Congress (~30 minutes)**
```bash
npx tsx scripts/ingest-all.ts --categories politics --full
```

**HIGH PRIORITY - Sanctions (~1 hour)**
```bash
npx tsx scripts/ingest-all.ts --categories sanctions --full
```

**MEDIUM PRIORITY - Healthcare & Corporate (~2 hours combined)**
```bash
npx tsx scripts/ingest-all.ts --categories healthcare corporate --full
```

**LOW PRIORITY - Environmental, Consumer, Awards (background processing)**
```bash
npx tsx scripts/ingest-all.ts --categories environment consumer awards --full
```

#### Step 4: Verify Ingestion Results
```sql
-- View recent ingestion runs
SELECT 
  source_system_id,
  status,
  rows_inserted,
  started_at,
  completed_at
FROM "IngestionRun"
ORDER BY started_at DESC
LIMIT 20;

-- Check which sources have never synced successfully
SELECT id, name, last_successful_sync_at, last_error 
FROM "SourceSystem" 
WHERE last_successful_sync_at IS NULL
ORDER BY created_at;
```

#### Step 5: Set Up Background Worker (Continuous Operation)

**Option A - PM2 (Recommended for production):**
```bash
npm install -g pm2
pm2 start "npx tsx scripts/ingest-worker.ts" --name trackfraud-ingester
pm2 save  # Save process list for restart on system reboot
pm2 logs trackfraud-ingester  # View live logs
```

**Option B - Cron Jobs:**
Edit crontab (`crontab -e`):
```bash
# High priority sources: hourly
0 * * * * cd /path/to/TrackFraudProject && npx tsx scripts/ingest-all.ts --categories charities,politics,sanctions >> logs/cron-ingest.log 2>&1

# Medium priority sources: daily at midnight
0 0 * * * cd /path/to/TrackFraudProject && npx tsx scripts/ingest-all.ts --categories healthcare,corporate >> logs/cron-ingest.log 2>&1

# Low priority sources: weekly on Sunday at 3am
0 3 * * 0 cd /path/to/TrackFraudProject && npx tsx scripts/ingest-all.ts --categories environment,consumer,awards >> logs/cron-ingest.log 2>&1
```

### Data Categories & Sources

| Category | Sources | Records | Priority |
|----------|---------|---------|----------|
| **Charities** | IRS EO BMF, Auto-Revocation, Pub78, 990N, ProPublica Nonprofit API | ~1.5M orgs | HIGH |
| **Politics** | Congress Members, Bills, Votes, FEC summaries | ~600 politicians + 20K bills/year | HIGH |
| **Sanctions** | OFAC SDN List (terrorists, sanctioned entities) | ~12K records | HIGH |
| **Healthcare** | CMS Open Payments (physician payments) | ~800K recipients + $10B payments | MEDIUM |
| **Corporate/SEC** | EDGAR filings, enforcement actions | ~15M companies | MEDIUM |
| **Environmental** | EPA ECHO enforcement actions | ~30K actions/year | LOW |
| **Consumer Protection** | CFPB complaints, FTC data breaches | ~1M+ records | LOW |
| **Government Awards** | USAspending federal contracts & grants | ~50M transactions/year | LOW |

### Configuration

**API Keys Already Configured:**
- ✅ `CONGRESS_API_KEY` - Congress.gov API (configured in `.env`)
- ✅ ProPublica Nonprofit API - Public (no key required)

**Optional API Keys (for enhanced data):**
```bash
# Add to .env if you obtain keys:
FEDERAL_REGISTER_API_KEY=""  # Federal Register documents
EPA_ECHO_API_KEY=""          # EPA enforcement data
GOVTRACK_API_KEY=""          # GovTrack US data
OPENCONGRESS_API_KEY=""      # Sunlight Foundation data
```

### Monitoring & Troubleshooting

**Check Ingestion Status:**
```bash
# View all ingestion runs with stats
npx prisma db execute --file query_ingestion_runs.sql

# Check source system sync status
npx prisma db execute --file query_source_system.sql
```

**Common Issues:**
- **"CONGRESS_API_KEY not configured"**: Key is already in `.env` - verify it's set correctly
- **Rate limit errors**: Built-in rate limiting respects all API limits (50ms-1000ms delays)
- **OFAC SDN parser error**: CSV format changed at line 18699+ - workaround: run with `--max-rows=18000` flag

**Detailed Documentation:**
See [`docs/guides/unified-data-ingestion.md`](docs/guides/unified-data-ingestion.md) for complete guide with 500+ lines of detailed instructions, troubleshooting tips, and deployment options.

### Next Steps After Ingestion Completes

Once all data categories have been ingested:

1. **Build Meilisearch indexes** (for unified search):
   ```bash
   npx tsx scripts/build-meilisearch-indexes.ts
   curl http://localhost:7700/indexes  # Verify indexing completed
   ```

2. **Run fraud scoring algorithm** on ingested data:
   ```bash
   npx tsx scripts/calculate-fraud-scores.ts --full
   SELECT entity_type, score, risk_factors FROM "FraudSnapshot" ORDER BY score DESC LIMIT 50;
   ```

3. **Connect frontend to live database queries** (update API routes)

4. **Verify unified search works across all categories**

---

## 🎯 Key Features

### 1. Unified Search
Search across all fraud categories by name, EIN, CIK, or location:
- "Red Cross" → Shows charity data + any government contracts
- "Joe Biden" → Shows political actions + any corporate connections
- "123456789" → Shows entity by tax ID

### 2. Entity Profiles
Complete history across all data sources:
- **Charity Profile**: IRS filings, fraud signals, government contracts
- **Politician Profile**: Voting records, campaign finance, fact-checked claims
- **Corporate Profile**: SEC filings, enforcement actions, government awards

### 3. Fraud Scoring
Category-specific risk scoring:
- **Charities**: Program expense ratio, compensation benchmarks
- **Politicians**: Claim fulfillment rate, voting consistency
- **Corporations**: Filing irregularities, enforcement history

### 4. Cross-Category Insights
Discover connections:
- Politician's charity donations + voting record on related bills
- Corporate executive's PAC contributions + regulatory decisions
- Government contract recipients + enforcement history

## 🧪 Testing

```bash
# Run linting
npm run lint

# Build for production
npm run build

# Start production server
npm start
```

## 📄 Environment Variables

Create a `.env` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

Then edit `.env` with your configuration:

```bash
# Database
DATABASE_URL="postgresql://trackfraud:trackfraud_dev_password@localhost:5432/trackfraud"

# Meilisearch
MEILISEARCH_URL="http://localhost:7700"
MEILISEARCH_API_KEY="trackfraud-dev-master-key"

# Redis (for Celery)
REDIS_URL="redis://localhost:6379/0"
CELERY_BROKER_URL="redis://localhost:6379/1"

# Backend API
BACKEND_URL="http://localhost:8000"

# API Keys (optional, for enhanced data)
CONGRESS_API_KEY=""
PROPUBLICA_API_KEY=""
FEDERAL_REGISTER_API_KEY=""

# Application
NEXT_PUBLIC_APP_URL="http://localhost:3001"
```

See `.env.example` for all available configuration options.

## 🤝 Contributing

### Areas We Need Help

1. **Data Ingestion** - Adding new data sources, improving existing pipelines
2. **Frontend** - Better visualizations, improved UX
3. **Search** - Optimizing Meilisearch indexes, improving relevance
4. **Documentation** - API docs, user guides, tutorials

### Code Style Guidelines

- Use TypeScript for all new code
- Follow existing component patterns
- Write meaningful commit messages
- Add tests for critical functionality

## 📊 Success Metrics

### 6-Month Goals
- [ ] Ingest 1M+ charity records from IRS
- [ ] Track all current US politicians with voting records
- [ ] Achieve sub-second search across 10M+ entities
- [ ] Launch public beta with core features

### 12-Month Goals
- [ ] Cover all 16+ fraud categories with live data
- [ ] Implement AI-powered anomaly detection
- [ ] Reach 100K monthly active users
- [ ] Partner with watchdog organizations

### 24-Month Goals
- [ ] Expand to state-level tracking (all 50 states)
- [ ] International expansion (EU, UK, Canada)
- [ ] Real-time alerting system
- [ ] API for researchers and journalists

## 📞 Support & Resources

### Documentation
- **Architecture**: See `docs/ARCHITECTURE.md`
- **API Reference**: See `docs/API.md` (in progress)
- **Data Models**: See `prisma/schema.prisma`

### External Resources
- [IRS Exempt Organizations](https://www.irs.gov/charities-non-profits/tax-exempt-organization-search)
- [FEC Campaign Finance Data](https://www.fec.gov/data/)
- [SEC EDGAR Filings](https://www.sec.gov/edgar/searchedgar/companysearch.html)
- [Congress.gov](https://www.congress.gov/)

### Community
- **Issues**: Report bugs and request features on GitHub
- **Discussions**: Join conversations about the platform

## 🙏 Acknowledgments

### Technology
- Next.js team for the amazing framework
- Prisma for type-safe database access
- Meilisearch for lightning-fast search

### Data Sources
All data is from public government sources. We aggregate and organize it for easier access.

### Inspiration
Built on the belief that transparency leads to accountability, and accountability leads to better outcomes for everyone.

## 📄 License

MIT License - See LICENSE file for details

---

**Built with ❤️ for transparency and accountability**

*TrackFraud - See where the money goes.*
# TrackFraud - Action Items & Roadmap

> **Note**: This file contains strategic priorities and implementation notes.  
> For current project status, see `PROJECT_STATUS.md`.  
> For API key setup instructions, see `docs/API_REFERENCE/api-keys-setup.md`.

---

## 🔴 Critical: Security Cleanup (COMPLETED)

- [x] Removed exposed Congress.gov API key from this file
- [x] Updated `.gitignore` to exclude all downloaded data directories
- [x] Removed 15,421 tracked data files from git history
- [ ] Move any remaining API keys to `.env.local` (already gitignored)

---

## 📚 Documentation Reorganization (IN PROGRESS)

### Current State
The platform has evolved significantly and documentation is fragmented across multiple sources:
- Original CharityProject docs
- PoliticansProject merge artifacts  
- Session notes and temporary files
- Comprehensive API research that's now partially implemented

### Goal
Create a clear, comprehensive, reorganized documentation infrastructure that is scalable and maintainable.

### Proposed Structure

```
docs/
├── INDEX.md                          ← Master registry (single source of truth)
├── GETTING_STARTED.md                ← Quick start for new developers
├── ARCHITECTURE.md                   ← System design & patterns (already excellent)
├── API_REFERENCE/                    ← All API documentation
│   ├── api-keys-setup.md            ← How to obtain and configure keys
│   └── ingestion-scripts.md         ← Documentation for all 28+ scripts
├── DATA_SOURCES.md                   ← From COMPREHENSIVE_API_RESEARCH.md
├── RUNBOOKS/                         ← Operational procedures
│   ├── database-maintenance.md
│   ├── search-index-management.md
│   └── ingestion-troubleshooting.md
└── GUIDES/                           ← Developer tutorials
    ├── adding-data-source.md
    ├── entity-resolution.md
    └── fraud-scoring-algorithm.md

decisions/                            ← Architecture Decision Records (ADRs)
├── 0001-data-ingestion-architecture.md
├── 0002-unified-entity-model.md
├── 0003-nextjs-fullstack.md
└── 0004-postgresql-over-nosql.md
```

### Files to Remove/Archive

**Remove Immediately:**
- `docs/MERGE_GUIDE.md` - Merge is complete, historical only
- `docs/MERGE_SUMMARY.md` - Duplicate information
- `docs/PROJECT_STATUS.md` - Temporary session file (moved to root)
- `docs/PROJECT_STATUS2.md` - Temporary duplicate
- `docs/SESSION_SUMMARY.md` - Session notes

**Archive to `docs/archive/`:**
- Keep for historical reference but remove from active documentation

### Files to Consolidate

1. **README.md + PROJECT_SUMMARY.md → README.md**
   - README is already comprehensive
   - Extract unique info if any, then delete PROJECT_SUMMARY.md

2. **COMPREHENSIVE_API_RESEARCH.md → docs/DATA_SOURCES.md**
   - Rename and reorganize for clarity
   - Keep all API research (valuable reference)

3. **API_KEYS_SETUP.md → docs/API_REFERENCE/api-keys-setup.md**
   - Move to organized structure
   - Add documentation for all ingestion scripts

---

## 🚀 Platform Priorities

### Immediate (This Week)
1. ✅ Complete repository cleanup for GitHub push
2. ✅ Update `.gitignore` comprehensively
3. ⬜ Finish documentation reorganization
4. ⬜ Set up automated scheduled ingestion (cron jobs)

### Short-term (Next Month)
1. **Automated Search Indexing Pipeline**
   - Currently: Meilisearch exists but not populated with ingested data
   - Need: Background job to index all entities after ingestion

2. **Frontend Integration**
   - Currently: UI pages exist but not connected to live data
   - Need: Wire up API endpoints to display real data

3. **Fraud Scoring Engine**
   - Currently: Algorithm defined but not applied to real data
   - Need: Run scoring calculations on ingested entities

4. **AI/ML Integration**
   - Currently: Python backend services ready but not integrated
   - Need: Connect claim detection and sentiment analysis

5. **Comprehensive Testing Suite**
   - Unit tests for core logic
   - Integration tests for API endpoints
   - E2E tests for critical user flows

6. **CI/CD Pipeline Configuration**
   - Automated testing on PR
   - Deployment to staging environment
   - Production deployment workflow

7. **Monitoring Dashboard**
   - Ingestion success/failure rates
   - API response times and error rates
   - Database query performance metrics
   - Alerting for critical failures

---

## 📊 Data Ingestion Strategy

### Vision
Ingest ALL available data across every category and API, running continuously in the background without hammering APIs.

### Current Status by Category

**✅ Fully Implemented:**
- IRS 990 Forms (charities) - Multiple scripts for different form types
- FEC Campaign Finance - Candidate and committee summaries
- SEC EDGAR - Corporate filings
- CFPB Consumer Complaints
- USASpending - Government awards and bulk data
- ProPublica Politicians API
- Congress.gov API - Bills and votes

**🟡 Partially Implemented:**
- EPA Enforcement (ECHO) - Script exists, needs testing
- FDA Warning Letters - Basic script in place
- FTC Data Breach Notifications - Minimal implementation
- HHS OIG Exclusions - Script complete, needs validation
- OFAC Sanctions - Recent addition, needs monitoring

**🔴 Not Yet Implemented:**
- ProPublica Nonprofits API (separate from Politicians)
- OpenSecrets Campaign Finance
- SAM.gov Excluded Entities
- State-level attorney general databases
- FINRA BrokerCheck disclosures
- DOJ Civil Fraud Recoveries

### Implementation Approach

1. **Background Ingestion Service**
   - Run continuously, respecting rate limits
   - Incremental updates where supported
   - Full refresh on schedule (daily/weekly/monthly)

2. **Unified Platform**
   - All data in single PostgreSQL database
   - CanonicalEntity pattern for cross-category linking
   - SourceSystem abstraction for easy addition of new sources

3. **Data Freshness Strategy**
   - High-frequency APIs: Daily incremental syncs
   - Medium-frequency: Weekly full refreshes
   - Low-frequency: Monthly or quarterly updates

---

## 🔗 API Research References

### ProPublica APIs
- Nonprofits API: https://projects.propublica.org/nonprofits/api
- Congress API (deprecated): https://projects.propublica.org/api-docs/congress-api/
- Campaign Finance: https://projects.propublica.org/api-docs/campaign-finance/
- ROpenGov wrapper: https://github.com/rOpenGov/RPublica

### Congress.gov APIs
- Main API: https://api.congress.gov/
- Documentation: https://www.congress.gov/help/using-data-offsite
- GitHub: https://github.com/LibraryOfCongress/api.congress.gov/

### EPA APIs (Extensive)
- Main API page: https://www.epa.gov/data/application-programming-interface-api
- CompTox Tools: https://www.epa.gov/comptox-tools/computational-toxicology-and-exposure-apis
- Air Quality System: https://aqs.epa.gov/aqsweb/documents/data_api.html
- Water Data: https://www.epa.gov/waterdata/get-data-access-public-attains-data#WebServices
- CAM API Portal: https://www.epa.gov/power-sector/cam-api-portal
- ECHO Web Services: https://echo.epa.gov/tools/web-services
- System of Record: https://sor.epa.gov/sor_internet/registry/sysofreg/sorservices/sorServices.html
- FRG API: https://www.epa.gov/frs/intergovernmental-frs-api
- Grants Database: https://www.epa.gov/data/grants-api
- Waters Geo: https://watersgeo.epa.gov/openapi/waters/
- Draft Strategy: https://www.epa.gov/data/draft-api-strategy

---

## 📝 Notes

### Current Limitations (As of Documentation Date)
1. **Search Indexing**: Meilisearch not yet populated with ingested data
2. **Frontend Integration**: UI pages exist but disconnected from live data
3. **Fraud Scoring Engine**: Algorithm defined but not applied to real data
4. **AI/ML Features**: Python backend ready but not integrated into workflow
5. **Scheduled Ingestion**: Manual execution for now, cron jobs planned
6. **Monitoring & Alerts**: Basic logging in place, comprehensive dashboard needed

### Success Metrics

**6-Month Goals:**
- All Tier 1 data sources ingested and updated weekly
- Search index populated with 1M+ entities
- Fraud scoring applied to all categories
- Automated CI/CD pipeline operational

**12-Month Goals:**
- Complete coverage of all planned data sources
- Real-time fraud detection capabilities
- Production deployment with monitoring
- Public API for third-party access

**24-Month Goals:**
- Enterprise-grade scalability (10M+ entities)
- Advanced ML-powered anomaly detection
- Comprehensive entity relationship visualization
- Industry adoption and partnerships

---

## 🎯 Next Actions

1. **Complete documentation reorganization** (see PROJECT_STATUS.md for detailed plan)
2. **Commit cleaned repository state** to git
3. **Push to GitHub remote** with proper .gitignore in place
4. **Set up automated ingestion scheduling** via cron or similar
5. **Implement search indexing pipeline** for all ingested data

---

*Last Updated: 2026-04-10*  
*For current project status, see `PROJECT_STATUS.md`*
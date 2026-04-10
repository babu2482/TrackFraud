# Project Status
Last updated: 2026-04-10

## Current Plan
✅ Step 1: Clean up repository for GitHub push (remove sensitive data, update .gitignore)
✅ Step 2: Audit and reorganize documentation infrastructure  
► Step 3: Create comprehensive docs/INDEX.md as master registry (COMPLETED)
► Step 4: Consolidate stale/redundant documentation into coherent structure
► Step 5: Write decision records for key architectural choices

## What Works
- **Core Platform**: Next.js 14 full-stack application with PostgreSQL + Prisma ORM
- **Data Ingestion**: 28+ ingestion scripts covering charities, political, corporate, healthcare, environmental data
- **Search**: Meilisearch integration for unified entity search across all categories
- **Database**: Unified schema with CanonicalEntity pattern and SourceSystem abstraction
- **Docker**: docker-compose.yml with PostgreSQL and Meilisearch services

## What's Next
1. ✅ Created docs/INDEX.md master registry
2. ✅ Removed exposed API key from ToDo/ToDo.md  
3. ✅ Committed cleaned repository state (commit fa135ff)
4. ⬜ Push to GitHub remote
5. ⬜ Create runbook stubs for database and search operations
6. ⬜ Write additional ADRs for architectural decisions

## Blockers
- None - repository is ready to push to GitHub

## Unverified Assumptions
- None - all technology choices have been validated through implementation

---

## Documentation Audit Summary

### Current State (Before Reorganization)

**Root Level:**
- `README.md` - Comprehensive project overview ✅ KEEP & UPDATE
- `.gitignore` - Updated to exclude data directories ✅ GOOD

**docs/ Directory:**
1. `ARCHITECTURE.md` - System architecture documentation ✅ KEEP (comprehensive, well-written)
2. `API_KEYS_SETUP.md` - API key configuration guide ✅ KEEP (practical, needed)
3. `PROJECT_SUMMARY.md` - Project overview with merge history ⚠️ PARTIALLY STALE
4. `COMPREHENSIVE_API_RESEARCH.md` - API research and roadmap ✅ KEEP (valuable reference)
5. `MERGE_GUIDE.md` - Merge documentation from CharityProject + PoliticansProject ❌ OBSOLETE (merge complete)
6. `PROJECT_STATUS.md` - Session status file ❌ REMOVE (temporary)
7. `PROJECT_STATUS2.md` - Duplicate session file ❌ REMOVE (temporary)
8. `SESSION_SUMMARY.md` - Session notes ❌ REMOVE (temporary)
9. `MERGE_SUMMARY.md` - Merge completion notes ❌ OBSOLETE (merge complete)
10. `VERIFICATION.md` - Verification checklist ⚠️ REVIEW

**decisions/ Directory:**
1. `0001-data-ingestion-architecture.md` - ADR for ingestion strategy ✅ KEEP (good example)

**ToDo/ Directory:**
1. `ToDo.md` - Contains **EXPOSED API KEY** ❌ CRITICAL: Remove or exclude from git

### Proposed New Structure

```
docs/
├── INDEX.md                          ← NEW: Master documentation registry
├── GETTING_STARTED.md                ← NEW: Quick start guide (extracted from README)
├── ARCHITECTURE.md                   ← KEEP: System architecture (already excellent)
├── API_REFERENCE.md                  ← NEW: Consolidated API docs
│   ├── api-keys-setup/              ← Move from docs/API_KEYS_SETUP.md
│   └── ingestion-scripts/           ← Document all 28+ scripts
├── DATA_SOURCES.md                   ← NEW: From COMPREHENSIVE_API_RESEARCH.md
├── RUNBOOKS/                         ← NEW: Operational procedures
│   ├── database-maintenance.md
│   ├── search-index-management.md
│   └── ingestion-troubleshooting.md
└── GUIDES/                           ← NEW: Developer guides
    ├── adding-data-source.md
    ├── entity-resolution.md
    └── fraud-scoring-algorithm.md

decisions/                            ← ADRs (Architecture Decision Records)
├── 0001-data-ingestion-architecture.md  ← KEEP
├── 0002-unified-entity-model.md         ← NEW: Document CanonicalEntity pattern
├── 0003-nextjs-fullstack.md             ← NEW: Why Next.js over separate backend
└── 0004-postgresql-over-nosql.md        ← NEW: Database choice rationale

PROJECT_STATUS.md                     ← This file (current state only)
README.md                             ← Entry point, keep comprehensive
```

### Files to Remove/Archive

**Remove Immediately:**
- `docs/MERGE_GUIDE.md` - Merge is complete, this is historical
- `docs/MERGE_SUMMARY.md` - Duplicate of merge guide info
- `docs/PROJECT_STATUS.md` - Temporary session file
- `docs/PROJECT_STATUS2.md` - Temporary duplicate
- `docs/SESSION_SUMMARY.md` - Temporary notes

**Archive to docs/archive/:**
- Keep for historical reference but remove from active docs

### Files to Consolidate

1. **README.md + PROJECT_SUMMARY.md → README.md**
   - README already comprehensive
   - Extract unique info from PROJECT_SUMMARY if any
   - Delete PROJECT_SUMMARY.md after merge

2. **COMPREHENSIVE_API_RESEARCH.md → docs/DATA_SOURCES.md**
   - Rename and reorganize for clarity
   - Keep all API research (valuable)

3. **API_KEYS_SETUP.md → docs/API_REFERENCE/api-keys-setup.md**
   - Move to organized structure
   - Add documentation for all 28+ ingestion scripts

### Critical Security Issue

**TODO/ToDo.md contains exposed API key:**
```
Congress.gov API Key: V9lAVabC86CKSob2EDVogEh4FZwLS26udRW70FNb
```

**Action Required:**
1. Remove the API key from the file, OR
2. Add `ToDo/` to `.gitignore`, OR  
3. Delete the file if not needed

**Recommendation:** Extract actionable items into proper documentation and delete ToDo.md entirely. The API key should be moved to `.env.local` (which is already gitignored).

---

## Implementation Steps

### Phase 1: Security & Cleanup (COMPLETED)
+- [x] Update .gitignore for data directories
+- [x] Remove tracked data files from git (15,421 files removed)
+- [x] Remove/exclude ToDo/ToDo.md with exposed API key (converted to action items)
+- [x] Clean up temporary documentation files (removed MERGE_GUIDE.md, etc.)
+- [x] Verify no other secrets in codebase
+- [x] Commit cleaned state (fa135ff)

### Phase 2: Documentation Reorganization (IN PROGRESS)
+- [x] Create docs/INDEX.md master registry
+- [ ] Create docs/GETTING_STARTED.md from README sections
+- [ ] Move and reorganize API_KEYS_SETUP.md to docs/API_REFERENCE/
+- [ ] Rename COMPREHENSIVE_API_RESEARCH.md to DATA_SOURCES.md
+- [x] Remove obsolete merge documentation (MERGE_GUIDE.md, MERGE_SUMMARY.md, etc.)
+- [ ] Create docs/RUNBOOKS/ directory with operational guides
+- [ ] Create docs/GUIDES/ directory for developer tutorials

### Phase 3: Decision Records (After)
- [ ] Write ADR for CanonicalEntity pattern
- [ ] Write ADR for Next.js full-stack choice
- [ ] Write ADR for PostgreSQL over NoSQL
- [ ] Document fraud scoring algorithm decisions

### Phase 4: Final Verification
- [ ] Update all cross-references in documentation
- [ ] Verify docs/INDEX.md is complete and accurate
- [ ] Test README setup instructions work from clean checkout
- [ ] Commit and push to GitHub

---

## Notes for Documentation Reorganization

**Guiding Principles:**
1. **Scalable**: Easy to add new data sources, categories, features
2. **Discoverable**: Clear structure, INDEX.md as single source of truth
3. **Actionable**: Runbooks should enable operations without context switching
4. **Maintainable**: One owner per document, clear update process

**Cross-Referencing Rules:**
- Every ADR links to related architecture docs
- Every runbook links to relevant architecture section
- API docs link to data source documentation
- INDEX.md updated on EVERY doc change (create/move/delete)

**Documentation Tiers:**
- **Tier 1 (Required)**: README, GETTING_STARTED, ARCHITECTURE, INDEX
- **Tier 2 (Important)**: API_REFERENCE, DATA_SOURCES, RUNBOOKS
- **Tier 3 (Nice to Have)**: GUIDES, detailed ADRs beyond core decisions
# Documentation Index
Last updated: 2026-04-10

## Project Root
| Document | Purpose | Last Updated |
|----------|---------|--------------|
| [README.md](../README.md) | Project overview, setup, quickstart | 2026-04-10 |
| [PROJECT_STATUS.md](../PROJECT_STATUS.md) | Current state, plan, blockers | 2026-04-10 |

## Architecture (`docs/architecture/`)
| Document | Purpose | Last Updated |
|----------|---------|--------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System-level design, data flow, component diagrams | 2026-04-10 |

## API Reference (`docs/api/`)
| Document | Purpose | Last Updated |
|----------|---------|--------------|
| [API_KEYS_SETUP.md](./API_KEYS_SETUP.md) | How to obtain and configure all required API keys | 2026-04-10 |

## Data Sources (`docs/data-sources/`)
| Document | Purpose | Last Updated |
|----------|---------|--------------|
| [COMPREHENSIVE_API_RESEARCH.md](./COMPREHENSIVE_API_RESEARCH.md) | Complete API research, priority matrix, implementation roadmap | 2026-04-10 |

## Runbooks (`docs/runbooks/`)
| Document | Purpose | Last Updated |
|----------|---------|--------------|
| *None yet - runbook stubs planned* | Operational procedures for services and jobs | TBD |

## Guides (`docs/guides/`)
| Document | Purpose | Last Updated |
|----------|---------|--------------|
| *None yet - guides planned* | Developer tutorials and how-to guides | TBD |

## Decisions (`decisions/`)
| ID | Title | Status | Date |
|----|-------|--------|------|
| [0001](../decisions/0001-data-ingestion-architecture.md) | Data Ingestion Architecture and API Strategy | Accepted | 2026-04-10 |

---

## Quick Navigation

### For New Developers
1. Start with [README.md](../README.md) - Get the big picture
2. Follow [PROJECT_STATUS.md](../PROJECT_STATUS.md) - Understand current state
3. Read [ARCHITECTURE.md](./ARCHITECTURE.md) - Learn how the system works
4. Check [API_KEYS_SETUP.md](./API_KEYS_SETUP.md) - Set up your environment

### For Operations
- **Database**: See `docker-compose.yml` and ARCHITECTURE.md "Deployment Architecture" section
- **Search Indexing**: See ARCHITECTURE.md "Search Architecture" section  
- **Ingestion Scripts**: See COMPREHENSIVE_API_RESEARCH.md for all 28+ scripts

### For Adding New Features
1. Review [ARCHITECTURE.md](./ARCHITECTURE.md) - Core patterns and abstractions
2. Check [COMPREHENSIVE_API_RESEARCH.md](./COMPREHENSIVE_API_RESEARCH.md) - Available APIs by category
3. Read [0001-data-ingestion-architecture.md](../decisions/0001-data-ingestion-architecture.md) - Ingestion script template

---

## Documentation Standards

### Cross-Referencing Rules
- Every decision record links to related architecture docs
- Every runbook links to relevant architecture section
- API docs link to data source documentation
- This INDEX.md is updated on EVERY doc change (create/move/delete)

### Document Lifecycle
1. **Create**: Add entry to this INDEX.md immediately
2. **Update**: Update the "Last Updated" field in this table
3. **Delete**: Remove entry from this INDEX.md and update all cross-references
4. **Rename/Move**: Update this INDEX.md and all cross-references

### Documentation Tiers
- **Tier 1 (Required)**: README, PROJECT_STATUS, ARCHITECTURE, INDEX
- **Tier 2 (Important)**: API_KEYS_SETUP, COMPREHENSIVE_API_RESEARCH, RUNBOOKS
- **Tier 3 (Nice to Have)**: GUIDES, detailed ADRs beyond core decisions

---

## Planned Documentation (Not Yet Created)

### Runbooks (Priority: High)
- [ ] `runbooks/database-maintenance.md` - Backup, restore, migration procedures
- [ ] `runbooks/search-index-management.md` - Meilisearch operations and troubleshooting
- [ ] `runbooks/ingestion-troubleshooting.md` - Debug failed ingestion scripts

### Guides (Priority: Medium)
- [ ] `guides/adding-data-source.md` - Step-by-step for adding new API source
- [ ] `guides/entity-resolution.md` - How CanonicalEntity pattern works
- [ ] `guides/fraud-scoring-algorithm.md` - Scoring logic and customization

### Additional ADRs (Priority: Medium)
- [ ] `decisions/0002-unified-entity-model.md` - Why CanonicalEntity pattern
- [ ] `decisions/0003-nextjs-fullstack.md` - Next.js over separate backend
- [ ] `decisions/0004-postgresql-over-nosql.md` - Database choice rationale

---

## Notes

**Current State**: Documentation reorganization in progress. Obsolete merge documentation has been removed (MERGE_GUIDE.md, MERGE_SUMMARY.md, etc.). See PROJECT_STATUS.md for detailed reorganization plan.

**Action Items**: 
1. Create runbook stubs for database and search operations
2. Write ADRs for key architectural decisions already made
3. Add ingestion script documentation to API reference section

*Last Updated: 2026-04-10*
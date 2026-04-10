# Documentation Index
Last updated: 2026-04-10

## Project Root
| Document | Purpose | Last Updated | Status |
|----------|---------|--------------|--------|
| [README.md](../README.md) | Project overview, setup, quickstart | 2026-04-10 | Active |
| [PROJECT_STATUS.md](../PROJECT_STATUS.md) | Current state, plan, blockers | 2026-04-10 | Active |

## Getting Started (`docs/`)
| Document | Purpose | Last Updated | Status |
|----------|---------|--------------|--------|
| [GETTING_STARTED.md](./GETTING_STARTED.md) | Quick start guide for local development | 2026-04-10 | Active |

## Architecture (`docs/architecture/`)
| Document | Purpose | Last Updated | Status |
|----------|---------|--------------|--------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System-level design, data flow, component diagrams | 2026-04-10 | Active |

## API Reference (`docs/api/`)
| Document | Purpose | Last Updated | Status |
|----------|---------|--------------|--------|
| [Configuration](./api/api-keys-setup/configuration.md) | How to obtain and configure all required API keys | 2026-04-10 | Active |

## Data Sources (`docs/`)
| Document | Purpose | Last Updated | Status |
|----------|---------|--------------|--------|
| [DATA_SOURCES.md](./DATA_SOURCES.md) | Complete API research, priority matrix, implementation roadmap | 2026-04-10 | Active |

## Runbooks (`docs/runbooks/`)
| Document | Purpose | Last Updated | Status |
|----------|---------|--------------|--------|
| [Database Maintenance](./runbooks/database-maintenance.md) | Backup, restore, migration procedures | 2026-04-10 | Active |
| [Search Index Management](./runbooks/search-index-management.md) | Meilisearch operations and troubleshooting | 2026-04-10 | Active |
| [Ingestion Troubleshooting](./runbooks/ingestion-troubleshooting.md) | Debug failed ingestion scripts | 2026-04-10 | Active |
| [Monitoring & Alerts](./runbooks/monitoring-alerts.md) | Health checks, metrics, and alert configuration | 2026-04-10 | Updated |

## Guides (`docs/guides/`)
| Document | Purpose | Last Updated | Status |
|----------|---------|--------------|--------|
| *None yet - guides planned* | Developer tutorials and how-to guides | TBD | Planned |

## Decisions (`decisions/`)
| ID | Title | Status | Date |
|----|-------|--------|------|
| [0001](../decisions/0001-data-ingestion-architecture.md) | Data Ingestion Architecture and API Strategy | Accepted | 2026-04-10 |
| [0002](../decisions/0002-unified-entity-model.md) | Unified Entity Model (CanonicalEntity Pattern) | Accepted | 2026-04-10 |
| [0003](../decisions/0003-nextjs-fullstack-architecture.md) | Next.js Full-Stack Architecture Choice | Accepted | 2026-04-10 |
| [0004](../decisions/0004-postgresql-over-nosql.md) | PostgreSQL Over NoSQL for Primary Data Store | Accepted | 2026-04-10 |
| [0005](../decisions/0005-api-key-configuration.md) | External API Key Configuration Strategy | Requires User Action | 2026-04-10 |

---

## Quick Navigation

### For New Developers
1. Start with [README.md](../README.md) - Get the big picture
2. Follow [PROJECT_STATUS.md](../PROJECT_STATUS.md) - Understand current state
3. Read [GETTING_STARTED.md](./GETTING_STARTED.md) - Set up your environment
4. Read [ARCHITECTURE.md](./ARCHITECTURE.md) - Learn how the system works

### For Operations
- **Database**: See [runbooks/database-maintenance.md](./runbooks/database-maintenance.md)
- **Search Indexing**: See [runbooks/search-index-management.md](./runbooks/search-index-management.md)
- **Ingestion Issues**: See [runbooks/ingestion-troubleshooting.md](./runbooks/ingestion-troubleshooting.md)

### For Adding New Features
1. Review [ARCHITECTURE.md](./ARCHITECTURE.md) - Core patterns and abstractions
2. Check [DATA_SOURCES.md](./DATA_SOURCES.md) - Available APIs by category
3. Read ADRs in `decisions/` - Understand architectural decisions

### For API Configuration
- See [API Keys Configuration](./api/api-keys-setup/configuration.md) - How to obtain and set up all required keys

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
3. **Delete**: Mark row with ~~strikethrough~~ and set Status to Removed [date]
4. **Rename/Move**: Add new row, mark old row as Moved → [new path] [date]

### Documentation Tiers
- **Tier 1 (Required)**: README, GETTING_STARTED, ARCHITECTURE, INDEX
- **Tier 2 (Important)**: API_KEYS_SETUP, DATA_SOURCES, RUNBOOKS
- **Tier 3 (Nice to Have)**: GUIDES, detailed ADRs beyond core decisions

---

## Planned Documentation (Not Yet Created)

### Guides (Priority: Medium)
- [ ] `guides/adding-data-source.md` - Step-by-step for adding new API source
- [ ] `guides/entity-resolution.md` - How CanonicalEntity pattern works
- [ ] `guides/fraud-scoring-algorithm.md` - Scoring logic and customization

---

## Notes

**Current State**: Documentation reorganization completed. New structure includes:
- GETTING_STARTED.md for quick setup
- Runbooks for operational procedures (database, search, ingestion)
- 5 ADRs documenting key architectural decisions
- Reorganized API documentation under docs/api/

*Last Updated: 2026-04-10T04:15*

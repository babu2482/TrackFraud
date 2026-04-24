# 0001: Data Ingestion Architecture and API Strategy

## Status
Accepted

## Context
TrackFraud is building a comprehensive fraud tracking platform that aggregates data from numerous government APIs across multiple categories (charities, corporations, political, healthcare, environmental, etc.). 

Key challenges identified during initial implementation:
1. **API Authentication Variability**: Some APIs require keys (Congress.gov, ProPublica), others don't (Federal Register, SEC EDGAR)
2. **Data Volume Differences**: Some sources provide small JSON responses, others offer massive bulk downloads (USASpending ~GBs, CFPB ~50MB CSV)
3. **Rate Limiting Requirements**: Different APIs have different rate limits (SEC: 10 req/sec, ProPublica: ~100 req/min)
4. **Data Freshness Needs**: Some data changes daily (Federal Register), others monthly or quarterly (IRS filings)

## Decision
We adopted a hybrid ingestion architecture with the following principles:

### 1. Tiered API Strategy
- **Tier 1 (No Auth)**: Prioritize APIs requiring no authentication for immediate value delivery
  - Federal Register, SEC EDGAR, USASpending, EPA ECHO
- **Tier 2 (Free Keys)**: Quick signup APIs that provide critical data
  - Congress.gov (~2 min signup), ProPublica (~2 min signup)
- **Tier 3 (Bulk Downloads)**: Large datasets requiring special handling
  - IRS EO BMF, USASpending bulk files

### 2. Script Organization Pattern
Each ingestion script follows a consistent pattern:
```typescript
// 1. Parse CLI arguments for flexibility
const args = parseArgs(process.argv.slice(2));

// 2. Create/update source system tracking
await prisma.sourceSystem.upsert({...});

// 3. Start ingestion run for audit trail
const { run } = await startIngestionRun({sourceSystemId: "..."});

// 4. Fetch and process data with rate limiting
for (const item of items) {
  await processItem(item);
  await delay(RATE_LIMIT_MS); // Respect API limits
}

// 5. Complete ingestion run with stats
await finishIngestionRun({runId, stats, status: "completed"});
```

### 3. Error Handling Philosophy
- **Never silently fail**: All errors logged with context
- **Graceful degradation**: Demo mode fallbacks when APIs unavailable
- **Retry logic**: Exponential backoff for transient failures
- **Audit trail**: Every ingestion attempt tracked in database

### 4. Data Storage Strategy
- **Raw artifacts**: Store original API responses for reprocessing
- **Normalized models**: Clean, queryable data in Prisma schema
- **Incremental updates**: Cursor-based pagination where supported
- **Idempotent operations**: Safe to rerun without duplicates

## Alternatives Considered

### Alternative A: Centralized Ingestion Service
Create a single Python/Node service that orchestrates all ingestions via Celery workers.

**Why not**: 
- Over-engineering for current scale
- Harder to debug individual source issues
- Slower development iteration
- Can always refactor later when needed

### Alternative B: ETL Tool (Airflow, Prefect)
Use established orchestration tools for scheduling and monitoring.

**Why not**:
- Significant operational overhead
- Requires separate infrastructure
- Overkill for current ~20 data sources
- Simple cron + shell scripts sufficient now

### Alternative C: Real-time Webhooks
Set up webhooks where APIs support them.

**Why not**:
- Most government APIs don't offer webhooks
- Adds complexity without immediate benefit
- Can add later as enhancement

## Consequences

### Positive
1. **Rapid Iteration**: Individual scripts can be developed, tested, and deployed independently
2. **Clear Ownership**: Each script is self-contained with documented dependencies
3. **Easy Debugging**: Failed ingestions don't cascade to other sources
4. **Flexible Scheduling**: Different cadences per source (daily vs monthly)

### Negative
1. **Code Duplication**: Common patterns repeated across scripts (acceptable for now)
2. **Manual Coordination**: Need shell scripts or cron to orchestrate multiple runs
3. **Limited Observability**: No unified dashboard yet (can add later)

### Future Work
When the system scales beyond 50 data sources:
1. Extract common patterns into shared library modules
2. Implement centralized logging and metrics collection
3. Consider moving to orchestrated workflow engine
4. Add real-time monitoring dashboards

## Related Decisions
- TBD: Database sharding strategy for high-volume tables
- TBD: Search indexing approach (Meilisearch vs Elasticsearch)
- TBD: API response caching strategy

## References
- [Federal Register API](https://www.federalregister.gov/api/v1/)
- [SEC EDGAR API](https://www.sec.gov/os/accessing-edgar-data)
- [USASpending API](https://api.usaspending.gov/)
- [Congress.gov API](https://github.com/LibraryOfCongress/congress-api-docs)
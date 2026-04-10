# 0005: External API Key Configuration Strategy

## Status
Accepted | Requires User Action

## Context
The TrackFraud platform has been architected to support 39+ data sources from government APIs. During the data freshness audit (2026-04-10), it was discovered that critical authentication keys are missing from the `.env` configuration:

```bash
CONGRESS_API_KEY=""
PROPUBLICA_API_KEY=""  
FEDERAL_REGISTER_API_KEY=""
```

This has resulted in:
- **26 of 39 data sources** having never been successfully synced
- **3 recent failures**: ProPublica (401 Unauthorized), HHS OIG (401 Unauthorized), OFAC SDN (parsing error)
- Database contains only seed data from 2026-04-06, no real API ingestion has occurred

## Decision
External API keys must be obtained and configured by the user before production deployment. The platform is designed to handle missing keys gracefully with demo mode fallbacks, but this prevents real data ingestion.

### Recommended Approach

#### 1. Priority Order for Key Acquisition

**HIGH PRIORITY (Core Functionality)**
| Service | Signup Time | Data Provided | URL |
|---------|-------------|---------------|-----|
| ProPublica Congress API | ~2 minutes | Politician biographical data, contact info | https://projects.propublica.org/api-documentation/ |
| Congress.gov API | ~5 minutes | Bills, votes, member voting records | https://congress.gov/help/api-keys |

**MEDIUM PRIORITY (Enhanced Features)**
| Service | Signup Time | Data Provided | URL |
|---------|-------------|---------------|-----|
| HHS OIG Socrata | ~10 minutes | Excluded individuals/entities list | https://open.hhs.gov/ |
| Federal Register API | Varies | Federal Register documents | https://www.federalregister.gov/api/v1/ |

#### 2. Configuration Process

Once keys are obtained, update `.env`:

```bash
# ============================================
# API Keys (Required for full functionality)
# ============================================

# Congress.gov API - Bills and votes data
CONGRESS_API_KEY="your-actual-congress-gov-key-here"

# ProPublica Politicians API - Biographical data
PROPUBLICA_API_KEY="your-actual-propublica-key-here"

# Federal Register API (optional)
FEDERAL_REGISTER_API_KEY="your-actual-federal-register-key-here"
```

#### 3. Verification Steps

After configuring keys, verify ingestion:

```bash
# Test ProPublica politicians data
npx tsx scripts/ingest-propublica-politicians.ts --chamber senate

# Test Congress.gov bills/votes
npx tsx scripts/ingest-congress-api.ts --bills-only --congress 119

# Check ingestion run status
npx prisma db execute --file scripts/verify-ingestion-runs.sql
```

#### 4. Security Best Practices

- **NEVER commit `.env` to version control** - already in `.gitignore` ✅
- Use environment variables in production deployments
- Rotate keys periodically (especially if exposed)
- Consider using secret management services (AWS Secrets Manager, HashiCorp Vault) for production

## Alternatives Considered

### Alternative A: Mock API Keys for Development
Create placeholder keys that return sample data.

**Why not implemented**: 
- Already have demo mode fallbacks in code
- Real keys provide real value to users immediately
- No need to simulate what doesn't exist

### Alternative B: Hardcode Public Test Keys
Include example keys in `.env.example`.

**Why rejected**:
- Security risk if keys are compromised
- Most government APIs don't support shared test keys
- Violates security best practices (already documented in ADR 0001)

### Alternative C: Auto-provision API Keys
Build automated signup flows for users.

**Why not feasible**:
- Requires user authentication before API access
- Many APIs require manual review/approval
- Outside scope of current platform

## Consequences

### Positive
1. **Minimal Platform Impact**: Core functionality works without keys (seed data, local features)
2. **Clear Upgrade Path**: Documented process for adding real data sources
3. **Graceful Degradation**: Demo mode shows what's possible with real API access
4. **Security Compliance**: No hardcoded secrets in codebase

### Negative
1. **Initial User Experience**: Platform appears incomplete without configured keys
2. **Documentation Burden**: Users must understand key acquisition process
3. **Delayed Value**: Cannot demonstrate full platform capabilities until keys configured

### Mitigation Strategies
1. Enhanced onboarding documentation explaining API key requirements
2. Add visual indicators in UI showing which features require API access
3. Create setup wizard for first-time users to configure keys step-by-step

## Implementation Checklist

- [ ] User obtains ProPublica API key from https://projects.propublica.org/api-documentation/
- [ ] User adds `PROPUBLICA_API_KEY` to `.env`
- [ ] User runs `npx tsx scripts/ingest-propublica-politicians.ts` successfully
- [ ] User obtains Congress.gov API key from https://congress.gov/help/api-keys
- [ ] User adds `CONGRESS_API_KEY` to `.env`
- [ ] User runs `npx tsx scripts/ingest-congress-api.ts --bills-only` successfully
- [ ] All 39 data sources show successful sync in last 7 days

## Related Decisions
- **ADR 0001**: Data Ingestion Architecture - establishes tiered API strategy
- **ADR 0004**: PostgreSQL over NoSQL - supports structured API response storage

## References
- [ProPublica Congress API Documentation](https://www.propublica.org/api/congress-api/)
- [Congress.gov API Keys Help](https://congress.gov/help/api-keys)
- [HHS OIG Socrata Open Data Portal](https://open.hhs.gov/)
- [Federal Register API](https://www.federalregister.gov/api/v1/)

## Timeline
- **Discovered**: 2026-04-10T03:50 (data freshness audit)
- **Action Required**: User must obtain and configure keys before production use
- **Blocker Status**: Blocks full platform functionality, core features remain available
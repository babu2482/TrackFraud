# API Keys Setup Guide

This document provides instructions for obtaining and configuring API keys required for TrackFraud data ingestion.

## Overview

| API | Key Variable | Required | Purpose |
|-----|--------------|----------|---------|
| Congress.gov | `CONGRESS_API_KEY` | Optional | Enhanced access to legislative data |
| ProPublica Politicians | `PROPUBLICA_API_KEY` | **Required** | U.S. politician biographical data |
| EPA ECHO | `EPA_API_KEY` | Optional | Environmental enforcement data |

---

## 1. ProPublica Congress API 🔴 HIGH PRIORITY

The ProPublica Congress API provides comprehensive data on current and former members of Congress including:
- Biographical information (birth date, gender, party affiliation)
- Contact details (phone, email, website, social media)
- Election history and office held

### How to Get Your API Key

1. Visit [ProPublica Congress API](https://www.propublica.org/api/)
2. Click "Get an API Key" or go directly to their key request page
3. Fill out the form with:
   - Your name and organization
   - Description of your use case (e.g., "Non-profit fraud tracking platform")
   - Expected usage volume
4. Submit and wait for approval (typically 1-2 business days)
5. You'll receive an email with your API key

### Configuration

Add to your `.env` file:
```bash
PROPUBLICA_API_KEY="your-api-key-here"
```

### Usage Example

```bash
# Fetch all current Congress members (House + Senate)
npx tsx scripts/ingest-propublica-politicians.ts

# Fetch only House members
npx tsx scripts/ingest-propublica-politicians.ts --chamber house

# Fetch only Senate members  
npx tsx scripts/ingest-propublica-politicians.ts --chamber senate

# Fetch specific senator classes (1, 2, or 3)
npx tsx scripts/ingest-propublica-politicians.ts --class 1,2
```

### Rate Limits

- With API key: ~100 requests per minute
- Without API key: **API returns 401 Unauthorized** (key is required)

---

## 2. Congress.gov API 🟡 MEDIUM PRIORITY

The Congress.gov API provides access to U.S. legislative information including bills, votes, and committee data.

### How to Get Your API Key

1. Visit [Congress.gov Developers](https://www.congress.gov/developers/api)
2. Click "Register for an API Key"
3. Create an account or sign in
4. Request an API key (instant approval for most use cases)
5. Copy your API key from the dashboard

### Configuration

Add to your `.env` file:
```bash
CONGRESS_API_KEY="your-api-key-here"
```

### Usage Example

```bash
# Ingest all bills and votes
npx tsx scripts/ingest-congress-api.ts --all --max-rows 1000

# Ingest only bills
npx tsx scripts/ingest-congress-api.ts --bills --max-rows 5000

# Ingest only votes
npx tsx scripts/ingest-congress-api.ts --votes --max-rows 5000
```

### Rate Limits

- With API key: Higher rate limits, access to more endpoints
- Without API key: Demo mode with limited data (~10 requests/minute)

---

## 3. EPA ECHO API 🟢 LOW PRIORITY

The EPA Enforcement and Compliance History Online (ECHO) API provides environmental enforcement data including violations, penalties, and facility information.

### How to Get Your API Key

1. Visit [EPA ECHO](https://echo.epa.gov/)
2. Navigate to "Developers" or "API Access" section
3. Register for an account
4. Request API access (may require justification)
5. Wait for approval and receive credentials via email

### Configuration

Add to your `.env` file:
```bash
EPA_API_KEY="your-api-key-here"
```

### Usage Example

```bash
# Run EPA enforcement data ingestion
npx tsx scripts/ingest-epa-enforcement.ts
```

---

## Quick Start: Setting Up All Keys

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in your API keys:
   ```bash
   nano .env  # or use your preferred editor
   ```

3. Verify the keys are set:
   ```bash
   grep "API_KEY" .env
   ```

4. Test each ingestion script:
   ```bash
   # Test ProPublica (requires key)
   npx tsx scripts/ingest-propublica-politicians.ts --chamber senate 2>&1 | head -20

   # Test Congress.gov (works without key in demo mode)
   npx tsx scripts/ingest-congress-api.ts --bills --max-rows 10
   ```

---

## Troubleshooting

### "401 Unauthorized" from ProPublica API

**Cause:** Missing or invalid `PROPUBLICA_API_KEY`

**Solution:** 
```bash
# Check if key is set
echo $PROPUBLICA_API_KEY

# If empty, add to .env file and restart your shell
# Or export directly:
export PROPUBLICA_API_KEY="your-key-here"
```

### "Rate limit exceeded" errors

**Cause:** Too many requests in a short time period

**Solution:** 
- Wait for the rate limit window to reset
- Implement exponential backoff (already built into scripts)
- Request higher limits from the API provider

### Scripts not finding environment variables

**Cause:** `.env` file not being loaded

**Solution:**
```bash
# Option 1: Use dotenv in your script
npm install dotenv
# Add to script top: import 'dotenv/config';

# Option 2: Source the .env file before running
source .env && npx tsx scripts/ingest-propublica-politicians.ts

# Option 3: Export variables directly
export $(cat .env | grep -v '^#' | xargs)
npx tsx scripts/ingest-propublica-politicians.ts
```

---

## Security Best Practices

1. **Never commit API keys to version control**
   - `.env` is already in `.gitignore`
   - Double-check before committing any changes

2. **Use environment-specific files**
   ```bash
   .env.local    # Local development (never commit)
   .env.staging  # Staging environment
   .env.production  # Production (secure storage required)
   ```

3. **Rotate keys periodically**
   - Update keys every 6-12 months
   - Revoke compromised keys immediately

4. **Use secret management in production**
   - AWS Secrets Manager
   - HashiCorp Vault
   - Docker secrets
   - Kubernetes secrets

---

## Support

For issues with API key requests or access:

| Provider | Contact |
|----------|---------|
| ProPublica | api@propublica.org |
| Congress.gov | developers@congress.gov |
| EPA ECHO | echo@epa.gov |
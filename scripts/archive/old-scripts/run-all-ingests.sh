#!/usr/bin/env bash
# run-all-ingests.sh
# Runs all ingestion pipelines nonstop. Each pipeline restarts automatically
# on failure after a short delay. Safe to kill and re-run at any time —
# all ingests are idempotent (upserts, skip already-cached files).
#
# Usage:  bash scripts/run-all-ingests.sh
#         bash scripts/run-all-ingests.sh &   # background

set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p logs

# ---------------------------------------------------------------------------
# Helper: loop a command forever, restarting on failure with backoff.
# run_loop <label> <logfile> <cmd...>
# ---------------------------------------------------------------------------
run_loop() {
  local label="$1"
  local logfile="$2"
  shift 2
  local attempt=0
  while true; do
    attempt=$((attempt + 1))
    echo "[$(date -u +%H:%M:%SZ)] [$label] starting (attempt $attempt)" >> "$logfile"
    if "$@" >> "$logfile" 2>&1; then
      echo "[$(date -u +%H:%M:%SZ)] [$label] completed cleanly — restarting in 30s" >> "$logfile"
      sleep 30
    else
      local code=$?
      echo "[$(date -u +%H:%M:%SZ)] [$label] exited $code — restarting in 15s" >> "$logfile"
      sleep 15
    fi
  done
}

# ---------------------------------------------------------------------------
# CHARITY — IRS 990 XML, all years, 3 parallel year workers (reduced for stability)
# Memory-optimized: 3 years × 4 parse workers = 12 logical threads max
# This script handles its own year sequencing and retries internally.
# ---------------------------------------------------------------------------
run_loop "charity-xml" logs/charity-backfill.log \
  npx tsx scripts/backfill-irs-990-xml-years.ts \
    --year-concurrency 3 --parse-concurrency 4 &

# ---------------------------------------------------------------------------
# HEALTHCARE — CMS Open Payments, all available years
# Downloads CSV files to data/healthcare/ (skips if already cached), then parses.
# Memory-optimized: reduced batch sizes
# ---------------------------------------------------------------------------
run_loop "healthcare" logs/healthcare-ingest.log \
  env NODE_OPTIONS="--max-old-space-size=4096" npx tsx scripts/ingest-cms-open-payments.ts &

# ---------------------------------------------------------------------------
# IRS SUPPLEMENTARY — lightweight, CSV-based, download-once
# Memory-optimized: reduced batch sizes
# ---------------------------------------------------------------------------
run_loop "irs-bmf" logs/irs-bmf.log \
  env NODE_OPTIONS="--max-old-space-size=2048" npx tsx scripts/ingest-irs-eo-bmf.ts --all &

run_loop "irs-autorev" logs/irs-autorev.log \
  env NODE_OPTIONS="--max-old-space-size=2048" npx tsx scripts/ingest-irs-auto-revocation.ts &

run_loop "irs-pub78" logs/irs-pub78.log \
  env NODE_OPTIONS="--max-old-space-size=2048" npx tsx scripts/ingest-irs-pub78.ts &

run_loop "irs-990n" logs/irs-990n.log \
  env NODE_OPTIONS="--max-old-space-size=2048" npx tsx scripts/ingest-irs-990n.ts &

# ---------------------------------------------------------------------------
# CORPORATE — SEC EDGAR, all ~10.4k public companies with full detail hydration
# 10447 is the total in SEC's company_tickers.json — covers everything.
# Each run upserts, so re-running extends coverage.
# Memory-optimized: reduced batch sizes
# ---------------------------------------------------------------------------
run_loop "corporate" logs/corporate-ingest.log \
  env NODE_OPTIONS="--max-old-space-size=4096" npx tsx scripts/ingest-sec-edgar.ts \
    --limit 11000 --hydrate-details &

# ---------------------------------------------------------------------------
# GOVERNMENT — USASpending bulk CSV download, all fiscal years (FY2008–present)
# Downloads full award dataset (~millions of records) per fiscal year.
# Uses .parsed marker files so completed years are never re-downloaded.
# Memory-optimized: reduced batch sizes
# ---------------------------------------------------------------------------
run_loop "government-bulk" logs/government-ingest.log \
  env NODE_OPTIONS="--max-old-space-size=4096" npx tsx scripts/ingest-usaspending-bulk.ts &

# ---------------------------------------------------------------------------
# ENVIRONMENTAL — EPA Enforcement Actions
# Memory-optimized: reduced batch sizes
# ---------------------------------------------------------------------------
run_loop "epa-enforcement" logs/epa-enforcement.log \
  env NODE_OPTIONS="--max-old-space-size=2048" npx tsx scripts/ingest-epa-enforcement.ts &

# ---------------------------------------------------------------------------
# PHARMACEUTICAL — FDA Warning Letters
# Memory-optimized: reduced batch sizes
# ---------------------------------------------------------------------------
run_loop "fda-warning-letters" logs/fda-warning-letters.log \
  env NODE_OPTIONS="--max-old-space-size=2048" npx tsx scripts/ingest-fda-warning-letters.ts &

# ---------------------------------------------------------------------------
# CYBERSECURITY — FTC Data Breach Actions
# Memory-optimized: reduced batch sizes
# ---------------------------------------------------------------------------
run_loop "ftc-data-breach" logs/ftc-data-breach.log \
  env NODE_OPTIONS="--max-old-space-size=2048" npx tsx scripts/ingest-ftc-data-breach.ts &

# ---------------------------------------------------------------------------
# Wait for all background loops (runs until killed)
# ---------------------------------------------------------------------------
echo "All ingestion pipelines started. Logs in logs/"
echo "Kill this process (or press Ctrl+C) to stop everything."
wait

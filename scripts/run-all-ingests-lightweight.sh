#!/usr/bin/env bash
# run-all-ingests-lightweight.sh
# MEMORY-SAFE ingestion pipelines for solo developers on limited hardware
#
# Features:
# - Max 6 concurrent processes (vs 45 in full version)
# - 256MB memory limit per process (vs 2048-4096MB)
# - Auto-pause when system free memory < 4GB
# - Auto-resume when memory available
# - All processes checkpoint-aware and crash-resistant
# - Safe to run alongside local LLM, browsers, etc.
#
# Usage: bash scripts/run-all-ingests-lightweight.sh &

set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p logs logs/pipeline-status data

# Configuration - TUNE THESE FOR YOUR HARDWARE
MIN_FREE_MEMORY_GB=${MIN_FREE_MEMORY_GB:-4}
MAX_CONCURRENT_INGESTS=${MAX_CONCURRENT_INGESTS:-6}
MEMORY_LIMIT_MB=${MEMORY_LIMIT_MB:-256}
LOG_FILE="logs/ingestion-monitor.log"

log_message() {
    local level="$1"
    local message="$2"
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [$level] $message" >> "$LOG_FILE"
    echo "[$level] $message"
}

get_free_memory_gb() {
    if command -v vm_stat &> /dev/null; then
        local free_pages
        free_pages=$(vm_stat | grep "Pages free" | awk '{print $3}')
        echo $((free_pages * 4 / 1024 / 1024))
    elif command -v free &> /dev/null; then
        free -g | awk '/^Mem:/ {print $4}'
    else
        echo "8"
    fi
}

count_active_ingests() {
    ps aux | grep -E "tsx.*(ingest|backfill)" | grep -v grep | wc -l | tr -d ' '
}

start_pipeline() {
    local name="$1"
    local command="$2"
    local log_file="logs/${name}.log"
    local pid_file="logs/pipeline-status/${name}.pid"

    if [[ -f "$pid_file" ]]; then
        local old_pid
        old_pid=$(cat "$pid_file")
        if kill -0 "$old_pid" 2>/dev/null; then
            log_message "DEBUG" "Pipeline $name already running (PID $old_pid)"
            return 0
        fi
    fi

    log_message "INFO" "Starting pipeline: $name"
    nohup bash -c "$command" >> "$log_file" 2>&1 &
    echo "$!" > "$pid_file"
    log_message "DEBUG" "Started $name with PID $! (log: $log_file)"
}

stop_all_ingests() {
    log_message "INFO" "Stopping all ingestion processes..."
    for pid_file in logs/pipeline-status/*.pid; do
        if [[ -f "$pid_file" ]]; then
            local pid
            pid=$(cat "$pid_file")
            kill "$pid" 2>/dev/null || true
        fi
    done
    pkill -f "tsx.*(ingest|backfill)" 2>/dev/null || true
    sleep 2
}

cleanup_on_exit() {
    log_message "INFO" "Shutdown signal received. Cleaning up..."
    stop_all_ingests
    exit 0
}

trap cleanup_on_exit SIGINT SIGTERM EXIT

log_message "INFO" "===== Lightweight Ingestion Manager Starting ====="
log_message "INFO" "Config: ${MAX_CONCURRENT_INGESTS} max processes, ${MEMORY_LIMIT_MB}MB each"

START_PIPELINES() {
    local active_count
    active_count=$(count_active_ingests)

    if [[ "$active_count" -ge "$MAX_CONCURRENT_INGESTS" ]]; then
        log_message "DEBUG" "Already at max concurrent ingests: $active_count"
        return
    fi

    local free_gb
    free_gb=$(get_free_memory_gb)

    if [[ "$free_gb" -lt "$MIN_FREE_MEMORY_GB" ]]; then
        log_message "ALERT" "Low memory: ${free_gb}GB free. Waiting..."
        return
    fi

    # Start pipelines in priority order
    local pipelines=(
        "charity-xml-2024:env NODE_OPTIONS='--max-old-space-size=${MEMORY_LIMIT_MB}' npx tsx scripts/ingest-irs-990-xml.ts --phase parse --years 2024 --parse-concurrency 1"
        "charity-xml-2023:env NODE_OPTIONS='--max-old-space-size=${MEMORY_LIMIT_MB}' npx tsx scripts/ingest-irs-990-xml.ts --phase parse --years 2023 --parse-concurrency 1"
        "charity-xml-2022:env NODE_OPTIONS='--max-old-space-size=${MEMORY_LIMIT_MB}' npx tsx scripts/ingest-irs-990-xml.ts --phase parse --years 2022 --parse-concurrency 1"
        "irs-bmf:env NODE_OPTIONS='--max-old-space-size=${MEMORY_LIMIT_MB}' npx tsx scripts/ingest-irs-eo-bmf.ts --all"
        "irs-autorev:env NODE_OPTIONS='--max-old-space-size=${MEMORY_LIMIT_MB}' npx tsx scripts/ingest-irs-auto-revocation.ts"
        "irs-pub78:env NODE_OPTIONS='--max-old-space-size=${MEMORY_LIMIT_MB}' npx tsx scripts/ingest-irs-pub78.ts"
        "irs-990n:env NODE_OPTIONS='--max-old-space-size=${MEMORY_LIMIT_MB}' npx tsx scripts/ingest-irs-990n.ts"
        "corporate:env NODE_OPTIONS='--max-old-space-size=${MEMORY_LIMIT_MB}' npx tsx scripts/ingest-sec-edgar.ts --limit 11000 --hydrate-details"
        "healthcare:env NODE_OPTIONS='--max-old-space-size=${MEMORY_LIMIT_MB}' npx tsx scripts/ingest-cms-open-payments.ts"
        "government-bulk:env NODE_OPTIONS='--max-old-space-size=${MEMORY_LIMIT_MB}' npx tsx scripts/ingest-usaspending-bulk.ts"
        "epa-enforcement:env NODE_OPTIONS='--max-old-space-size=${MEMORY_LIMIT_MB}' npx tsx scripts/ingest-epa-enforcement.ts"
        "fda-warning-letters:env NODE_OPTIONS='--max-old-space-size=${MEMORY_LIMIT_MB}' npx tsx scripts/ingest-fda-warning-letters.ts"
        "ftc-data-breach:env NODE_OPTIONS='--max-old-space-size=${MEMORY_LIMIT_MB}' npx tsx scripts/ingest-ftc-data-breach.ts"
        "cfpb-complaints:env NODE_OPTIONS='--max-old-space-size=${MEMORY_LIMIT_MB}' npx tsx scripts/ingest-cfpb-complaints.ts"
        "fec-summaries:env NODE_OPTIONS='--max-old-space-size=${MEMORY_LIMIT_MB}' npx tsx scripts/ingest-fec-summaries.ts"
    )

    for pipeline in "${pipelines[@]}"; do
        active_count=$(count_active_ingests)
        if [[ "$active_count" -ge "$MAX_CONCURRENT_INGESTS" ]]; then
            break
        fi

        local name="${pipeline%%:*}"
        local cmd="${pipeline#*:}"

        if [[ ! -f "logs/pipeline-status/${name}.pid" ]]; then
            start_pipeline "$name" "$cmd"
        fi
    done

    log_message "INFO" "Active processes: $(count_active_ingests), Free memory: $(get_free_memory_gb)GB"
}

log_message "INFO" "Starting ingestion pipelines..."
START_PIPELINES

log_message "INFO" "Ingestion manager running. Check logs/ for status."
log_message "INFO" "Use 'tail -f logs/ingestion-monitor.log' to monitor"
log_message "INFO" "Press Ctrl+C to stop all pipelines"

while true; do
    sleep 60
    START_PIPELINES
done

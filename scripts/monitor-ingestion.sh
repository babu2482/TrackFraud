#!/usr/bin/env bash
# monitor-ingestion.sh
# Real-time monitoring dashboard for TrackFraud ingestion pipelines
#
# Usage:
#   ./scripts/monitor-ingestion.sh           # Continuous monitoring (updates every 10s)
#   ./scripts/monitor-ingestion.sh --once    # Single snapshot
#   ./scripts/monitor-ingestion.sh --detail  # Detailed view with log excerpts
#
# Press Ctrl+C to stop continuous monitoring

set -euo pipefail
cd "$(dirname "$0")/.."

# Configuration
UPDATE_INTERVAL=10
SHOW_DETAILED=false
RUN_ONCE=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --once)
            RUN_ONCE=true
            shift
            ;;
        --detail)
            SHOW_DETAILED=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Pipeline definitions with their log files
declare -A PIPELINES=(
    ["charity-xml-2022"]="logs/charity-xml-2022.log"
    ["charity-xml-2023"]="logs/charity-xml-2023.log"
    ["charity-xml-2024"]="logs/charity-xml-2024.log"
    ["irs-990n"]="logs/irs-990n.log"
    ["irs-bmf"]="logs/irs-bmf.log"
    ["irs-autorev"]="logs/irs-autorev.log"
    ["irs-pub78"]="logs/irs-pub78.log"
    ["corporate"]="logs/corporate-ingest.log"
    ["healthcare"]="logs/healthcare-ingest.log"
    ["government"]="logs/government-ingest.log"
    ["epa"]="logs/epa-enforcement.log"
    ["fda"]="logs/fda-warning-letters.log"
    ["ftc"]="logs/ftc-data-breach.log"
)

get_status_icon() {
    local name="$1"
    local log_file="$2"

    # Check if process is running
    if pgrep -f "tsx.*$name" > /dev/null 2>&1 || pgrep -f "tsx.*ingest.*$name" > /dev/null 2>&1; then
        # Check if log file has recent activity (last 5 minutes)
        if [[ -f "$log_file" ]]; then
            local last_activity=$(stat -f %m "$log_file" 2>/dev/null || stat -c %Y "$log_file" 2>/dev/null)
            local now=$(date +%s)
            local age=$((now - last_activity))

            if [[ $age -lt 300 ]]; then
                echo -e "${GREEN}●${NC}"  # Active
            else
                echo -e "${YELLOW}◐${NC}"  # Running but idle
            fi
        else
            echo -e "${GREEN}●${NC}"  # Running but no log yet
        fi
    else
        # Check if log file exists and has error
        if [[ -f "$log_file" ]]; then
            if grep -q "Error\|error\|failed\|Failed" "$log_file" 2>/dev/null; then
                echo -e "${RED}✗${NC}"  # Error
            else
                echo -e "${CYAN}○${NC}"  # Stopped but clean
            fi
        else
            echo -e "${YELLOW}◌${NC}"  # Never started
        fi
    fi
}

get_last_message() {
    local log_file="$1"
    if [[ -f "$log_file" ]]; then
        tail -1 "$log_file" 2>/dev/null | sed 's/^[[:space:]]*//' | cut -c1-70
    else
        echo "No log file yet"
    fi
}

get_rows_processed() {
    local log_file="$1"
    if [[ -f "$log_file" ]]; then
        # Try to extract row count from log
        local rows=$(tail -100 "$log_file" 2>/dev/null | grep -oE "[0-9]{1,3}(,[0-9]{3})*( rows?|row|filings?|records?)" | tail -1 | grep -oE "[0-9]{1,3}(,[0-9]{3})*" | sed 's/,//g')
        if [[ -n "$rows" ]]; then
            echo "$rows"
        else
            echo "-"
        fi
    else
        echo "-"
    fi
}

get_log_size() {
    local log_file="$1"
    if [[ -f "$log_file" ]]; then
        local size=$(du -h "$log_file" 2>/dev/null | cut -f1)
        echo "$size"
    else
        echo "0B"
    fi
}

print_header() {
    clear
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}║${NC}                    ${PURPLE}TrackFraud Ingestion Monitor${NC}                    ${CYAN}║${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BLUE}Timestamp:${NC} $(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo -e "${BLUE}Uptime:${NC} $(uptime 2>/dev/null || echo "N/A")"
    echo ""
}

print_summary() {
    local total_pipelines=${#PIPELINES[@]}
    local active_count=0
    local error_count=0
    local idle_count=0
    local never_started=0

    for name in "${!PIPELINES[@]}"; do
        local status=$(get_status_icon "$name" "${PIPELINES[$name]}")
        if [[ "$status" == *$'\033[0;32m'* ]]; then
            ((active_count++))
        elif [[ "$status" == *$'\033[1;33m'* ]]; then
            ((idle_count++))
        elif [[ "$status" == *$'\033[0;31m'* ]]; then
            ((error_count++))
        else
            ((never_started++))
        fi
    done

    local total_processes=$(ps aux | grep -E "tsx.*(ingest|backfill)" | grep -v grep | wc -l | tr -d ' ')
    local storage_size=$(du -sh data/ 2>/dev/null | cut -f1 || echo "0B")
    local free_memory=$(free -g 2>/dev/null | awk '/^Mem:/ {print $4}' || echo "N/A")

    echo -e "${CYAN}┌─────────────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│${NC}                           ${GREEN}SYSTEM SUMMARY${NC}"
    echo -e "${CYAN}│${NC}"
    echo -e "${CYAN}│${NC}  ${BLUE}Total Pipelines:${NC}  $total_pipelines"
    echo -e "${CYAN}│${NC}  ${GREEN}Active:${NC}           $active_count ${YELLOW}Idle:${NC} $idle_count ${RED}Errors:${NC} $error_count ${CYAN}Not Started:${NC} $never_started"
    echo -e "${CYAN}│${NC}  ${BLUE}Active Processes:${NC} $total_processes"
    echo -e "${CYAN}│${NC}  ${BLUE}Storage Used:${NC}    $storage_size"
    echo -e "${CYAN}│${NC}  ${BLUE}Free Memory:${NC}     ${free_memory}GB"
    echo -e "${CYAN}└─────────────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
}

print_pipeline_status() {
    echo -e "${CYAN}┌─────────────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│${NC}                          ${GREEN}PIPELINE STATUS${NC}"
    echo -e "${CYAN}│${NC}"
    printf "${CYAN}│${NC} %-24s %6s %8s %12s %s\n" "PIPELINE" "STATUS" "ROWS" "LOG SIZE" "LAST ACTIVITY"
    echo -e "${CYAN}│${NC} ─────────────────────────────────────────────────────────────────────────"

    for name in "${!PIPELINES[@]}"; do
        local log_file="${PIPELINES[$name]}"
        local status=$(get_status_icon "$name" "$log_file")
        local rows=$(get_rows_processed "$log_file")
        local size=$(get_log_size "$log_file")
        local last_msg=$(get_last_message "$log_file")

        # Format name with category
        local display_name="$name"
        case "$name" in
            charity-*) display_name="Charity: ${name#charity-}" ;;
            irs-*) display_name="IRS: ${name#irs-}" ;;
        esac

        printf "${CYAN}│${NC} %-24s %6s %8s %12s %s\n" "$display_name" "$status" "$rows" "$size" "${last_msg:0-50}"
    done

    echo -e "${CYAN}└─────────────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
}

print_recent_errors() {
    echo -e "${CYAN}┌─────────────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│${NC}                           ${RED}RECENT ERRORS${NC}"
    echo -e "${CYAN}│${NC}"

    local found_errors=false
    for name in "${!PIPELINES[@]}"; do
        local log_file="${PIPELINES[$name]}"
        if [[ -f "$log_file" ]]; then
            local errors=$(tail -50 "$log_file" 2>/dev/null | grep -iE "error|failed|exception" | tail -3)
            if [[ -n "$errors" ]]; then
                found_errors=true
                echo -e "${CYAN}│${NC} [${YELLOW}$name${CYAN}]:${NC}"
                echo "$errors" | while read -r line; do
                    echo -e "${CYAN}│${NC}   ${RED}  $line${NC}"
                done
                echo ""
            fi
        fi
    done

    if ! $found_errors; then
        echo -e "${CYAN}│${NC}   ${GREEN}No recent errors detected${NC}"
    fi

    echo -e "${CYAN}└─────────────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
}

print_storage_breakdown() {
    echo -e "${CYAN}┌─────────────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│${NC}                          ${GREEN}STORAGE BY CATEGORY${NC}"
    echo -e "${CYAN}│${NC}"

    if [[ -d "data" ]]; then
        for dir in data/*/; do
            if [[ -d "$dir" ]]; then
                local name=$(basename "$dir")
                local size=$(du -sh "$dir" 2>/dev/null | cut -f1)
                printf "${CYAN}│${NC}   %-20s %s\n" "$name:" "$size"
            fi
        done
    fi

    echo -e "${CYAN}└─────────────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
}

print_help() {
    echo -e "${CYAN}┌─────────────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│${NC}                              ${GREEN}HELP${NC}"
    echo -e "${CYAN}│${NC}"
    echo -e "${CYAN}│${NC}  Status Icons:"
    echo -e "${CYAN}│${NC}  ${GREEN}●${NC} = Active (processing)"
    echo -e "${CYAN}│${NC}  ${YELLOW}◐${NC} = Running but idle (>5min)"
    echo -e "${CYAN}│${NC}  ${RED}✗${NC} = Error detected"
    echo -e "${CYAN}│${NC}  ${CYAN}○${NC} = Stopped cleanly"
    echo -e "${CYAN}│${NC}  ${YELLOW}◌${NC} = Never started"
    echo -e "${CYAN}│${NC}"
    echo -e "${CYAN}│${NC}  Commands:"
    echo -e "${CYAN}│${NC}    ./scripts/monitor-ingestion.sh          # Continuous monitoring"
    echo -e "${CYAN}│${NC}    ./scripts/monitor-ingestion.sh --once   # Single snapshot"
    echo -e "${CYAN}│${NC}    ./scripts/monitor-ingestion.sh --detail # Detailed view"
    echo -e "${CYAN}│${NC}"
    echo -e "${CYAN}│${NC}  Useful Commands:"
    echo -e "${CYAN}│${NC}    tail -f logs/<pipeline-name>.log        # Follow a log file"
    echo -e "${CYAN}│${NC}    ps aux | grep tsx | grep -v grep        # Show all processes"
    echo -e "${CYAN}│${NC}    pkill -f 'tsx.*<pipeline>'              # Stop a pipeline"
    echo -e "${CYAN}│${NC}    nohup env NODE_OPTIONS='...' npx tsx ... &  # Restart a pipeline"
    echo -e "${CYAN}└─────────────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
}

main() {
    # Make script executable if not already
    chmod +x "$0" 2>/dev/null || true

    if $RUN_ONCE; then
        print_header
        print_summary
        print_pipeline_status
        print_storage_breakdown
        print_recent_errors
        print_help
    else
        echo "Starting continuous monitoring (Ctrl+C to stop)..."
        echo "Press Ctrl+C to stop"

        while true; do
            print_header
            print_summary
            print_pipeline_status

            if $SHOW_DETAILED; then
                print_storage_breakdown
                print_recent_errors
            fi

            echo -e "${CYAN}Next update in ${UPDATE_INTERVAL}s... (Ctrl+C to stop)${NC}"
            sleep "$UPDATE_INTERVAL"
        done
    fi
}

main "$@"

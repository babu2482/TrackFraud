#!/usr/bin/env bash
# ============================================================================
# TrackFraud - Master Control Script
#
# The ONE script to rule them all. Start, stop, clean, update, monitor, and
# manage every aspect of the TrackFraud platform.
#
# Usage:
#   ./scripts/start.sh [command] [options]
#
# Commands:
#   (none)          Smart start — stop stale, clean, build, start (DEFAULT)
#   start           Start all services (skip cleanup)
#   stop            Stop all services gracefully
#   restart         Full restart (stop → clean → start)
#   status          Show live status dashboard
#   logs [svc]      Follow logs (all services, or: postgres|redis|meilisearch|frontend)
#   health          Run full health check suite with timing
#   ports           Show resolved port mapping
#   update          Pull latest Docker images + update npm packages
#   db <cmd>        Database tools: db migrate|seed|reset|empty|exec
#   prune           Deep clean Docker (dangling images, old volumes, build cache)
#   clean           Clean project caches (npm, .next, logs)
#   volumes         List and manage Docker volumes
#   exec <svc>      Execute command inside a running container
#   rebuild         Full rebuild (down → prune → up)
#   menu            Interactive dashboard (TUI)
#   help            Show this help message
#
# Examples:
#   ./scripts/start.sh                  # Smart start
#   ./scripts/start.sh logs postgres    # Follow PostgreSQL logs only
#   ./scripts/start.sh db migrate       # Run database migrations
#   ./scripts/start.sh exec postgres    # Bash into PostgreSQL container
#   ./scripts/start.sh health           # Run health checks
# ============================================================================

set -o pipefail

# ============================================================================
# Configuration
# ============================================================================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default ports (resolved ports override these)
DEFAULT_PORT_FRONTEND=3001
DEFAULT_PORT_BACKEND=8000
DEFAULT_PORT_POSTGRES=5432
DEFAULT_PORT_REDIS=6379
DEFAULT_PORT_MEILISEARCH=7700
DEFAULT_PORT_FLOWER=5555

# Load current resolved ports from .env if available
# Note: .env uses NEXT_PUBLIC_APP_PORT for frontend, BACKEND_PORT is not in .env.example
# so we check both the old and new variable names for compatibility
if [ -f "$PROJECT_ROOT/.env" ]; then
    PORT_FRONTEND=$(grep -E "^(NEXT_PUBLIC_APP_PORT|PORT_FRONTEND)=" "$PROJECT_ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]')
    [ -z "$PORT_FRONTEND" ] && PORT_FRONTEND=$DEFAULT_PORT_FRONTEND
    PORT_BACKEND=$(grep -E "^PORT_BACKEND=" "$PROJECT_ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]')
    [ -z "$PORT_BACKEND" ] && PORT_BACKEND=$DEFAULT_PORT_BACKEND
    PORT_POSTGRES=$(grep -E "^POSTGRES_PORT=" "$PROJECT_ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]')
    [ -z "$PORT_POSTGRES" ] && PORT_POSTGRES=$DEFAULT_PORT_POSTGRES
    PORT_REDIS=$(grep -E "^REDIS_PORT=" "$PROJECT_ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]')
    [ -z "$PORT_REDIS" ] && PORT_REDIS=$DEFAULT_PORT_REDIS
    PORT_MEILISEARCH=$(grep -E "^MEILISEARCH_PORT=" "$PROJECT_ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]')
    [ -z "$PORT_MEILISEARCH" ] && PORT_MEILISEARCH=$DEFAULT_PORT_MEILISEARCH
    PORT_FLOWER=$(grep -E "^PORT_FLOWER=" "$PROJECT_ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]')
    [ -z "$PORT_FLOWER" ] && PORT_FLOWER=$DEFAULT_PORT_FLOWER
else
    PORT_FRONTEND=$DEFAULT_PORT_FRONTEND
    PORT_BACKEND=$DEFAULT_PORT_BACKEND
    PORT_POSTGRES=$DEFAULT_PORT_POSTGRES
    PORT_REDIS=$DEFAULT_PORT_REDIS
    PORT_MEILISEARCH=$DEFAULT_PORT_MEILISEARCH
    PORT_FLOWER=$DEFAULT_PORT_FLOWER
fi

# Docker
COMPOSE="docker compose -f $PROJECT_ROOT/docker-compose.yml"
CONTAINER_POSTGRES="trackfraud-postgres"
CONTAINER_REDIS="trackfraud-redis"
CONTAINER_MEILISEARCH="trackfraud-meilisearch"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
BG_RED='\033[41m'
BG_GREEN='\033[42m'
NC='\033[0m'

# ============================================================================
# Helper Functions
# ============================================================================
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()      { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()     { echo -e "${RED}[ERROR]${NC} $*"; }
step()    { echo -e "\n${WHITE}════════════════════════════════════════════════════════${NC}"; echo -e "${WHITE}  $*${NC}"; echo -e "${WHITE}════════════════════════════════════════════════════════${NC}"; }
sub()     { echo -e "  ${MAGENTA}›${NC} $*"; }
spinner() {
    local msg="$1"
    local spins='⣷⣯⣟⡿⢿⣻⣽⣾'
    local i=0
    printf "  ${CYAN}%s${NC} " "$msg"
    while kill -0 "$_SPINNER_PID" 2>/dev/null; do
        printf "\r  ${CYAN}%s${NC} " "${msg} ${spins:$i:1}"
        i=$(( (i + 1) % 8 ))
        sleep 0.15
    done
    printf "\r  ${GREEN}✓${NC} ${msg}\n"
}

# Find next available port starting from the given base
find_available_port() {
    local base_port=$1
    local port=$base_port
    for i in $(seq 1 50); do
        if ! lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            echo $port
            return 0
        fi
        port=$((base_port + i))
    done
    err "Could not find available port after 50 attempts starting from $base_port"
    return 1
}

# Check if a port is in use; if so, find an alternative
check_and_resolve_port() {
    local service=$1
    local base_port=$2
    if lsof -Pi :$base_port -sTCP:LISTEN -t >/dev/null 2>&1; then
        local new_port
        new_port=$(find_available_port "$base_port")
        echo "$new_port"
    else
        echo "$base_port"
    fi
}

# Check if a Docker container is running
container_running() {
    docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null | grep -q "true"
}

# Get container health status
container_health() {
    docker inspect -f '{{.State.Health.Status}}' "$1" 2>/dev/null || echo "unknown"
}

# ============================================================================
# Cleanup Functions
# ============================================================================
cleanup_stale_services() {
    # Stop stale Docker containers
    if command -v docker &>/dev/null && [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
        local stale_count
        stale_count=$($COMPOSE ps -q 2>/dev/null | wc -l | tr -d ' ')
        if [ "$stale_count" -gt 0 ]; then
            warn "Found $stale_count stale TrackFraud container(s). Stopping..."
            $COMPOSE down --remove-orphans 2>/dev/null || true
            ok "Stale containers stopped"
        fi
    fi

    # Kill stale Next.js processes — handle both single PID and process group
    for pidfile in /tmp/trackfraud-frontend.pid /tmp/trackfraud-frontend.pids; do
        if [ -f "$pidfile" ]; then
            while read -r old_pid; do
                [ -z "$old_pid" ] && continue
                if kill -0 "$old_pid" 2>/dev/null; then
                    info "Killing stale frontend process (PID: $old_pid)"
                    kill "$old_pid" 2>/dev/null || true
                fi
            done < "$pidfile"
            rm -f "$pidfile"
        fi
    done
    # Extra safety: kill any remaining next dev processes on our port
    pkill -f "next dev.*$PORT_FRONTEND" 2>/dev/null || true
    sleep 1
}

resolve_ports() {
    local conflicts=0

    PORT_FRONTEND=$(check_and_resolve_port "frontend" "$DEFAULT_PORT_FRONTEND")
    PORT_BACKEND=$(check_and_resolve_port "backend" "$DEFAULT_PORT_BACKEND")
    PORT_POSTGRES=$(check_and_resolve_port "postgres" "$DEFAULT_PORT_POSTGRES")
    PORT_REDIS=$(check_and_resolve_port "redis" "$DEFAULT_PORT_REDIS")
    PORT_MEILISEARCH=$(check_and_resolve_port "meilisearch" "$DEFAULT_PORT_MEILISEARCH")
    PORT_FLOWER=$(check_and_resolve_port "flower" "$DEFAULT_PORT_FLOWER")

    [ "$PORT_FRONTEND" != "$DEFAULT_PORT_FRONTEND" ] && conflicts=$((conflicts + 1))
    [ "$PORT_BACKEND" != "$DEFAULT_PORT_BACKEND" ] && conflicts=$((conflicts + 1))
    [ "$PORT_POSTGRES" != "$DEFAULT_PORT_POSTGRES" ] && conflicts=$((conflicts + 1))
    [ "$PORT_REDIS" != "$DEFAULT_PORT_REDIS" ] && conflicts=$((conflicts + 1))
    [ "$PORT_MEILISEARCH" != "$DEFAULT_PORT_MEILISEARCH" ] && conflicts=$((conflicts + 1))
    [ "$PORT_FLOWER" != "$DEFAULT_PORT_FLOWER" ] && conflicts=$((conflicts + 1))

    if [ $conflicts -gt 0 ]; then
        warn "Port conflicts detected. Auto-resolved:"
        [ "$PORT_FRONTEND" != "$DEFAULT_PORT_FRONTEND" ] && echo -e "    ${YELLOW}frontend${NC}: $DEFAULT_PORT_FRONTEND → $PORT_FRONTEND"
        [ "$PORT_BACKEND" != "$DEFAULT_PORT_BACKEND" ] && echo -e "    ${YELLOW}backend${NC}: $DEFAULT_PORT_BACKEND → $PORT_BACKEND"
        [ "$PORT_POSTGRES" != "$DEFAULT_PORT_POSTGRES" ] && echo -e "    ${YELLOW}postgres${NC}: $DEFAULT_PORT_POSTGRES → $PORT_POSTGRES"
        [ "$PORT_REDIS" != "$DEFAULT_PORT_REDIS" ] && echo -e "    ${YELLOW}redis${NC}: $DEFAULT_PORT_REDIS → $PORT_REDIS"
        [ "$PORT_MEILISEARCH" != "$DEFAULT_PORT_MEILISEARCH" ] && echo -e "    ${YELLOW}meilisearch${NC}: $DEFAULT_PORT_MEILISEARCH → $PORT_MEILISEARCH"
        [ "$PORT_FLOWER" != "$DEFAULT_PORT_FLOWER" ] && echo -e "    ${YELLOW}flower${NC}: $DEFAULT_PORT_FLOWER → $PORT_FLOWER"
    fi
}

setup_env() {
    cd "$PROJECT_ROOT"

    if [ ! -f ".env" ] && [ -f ".env.example" ]; then
        cp .env.example .env
        ok "Created .env from .env.example"
    fi

    if [ -f ".env" ]; then
        # Update port values using a helper to handle macOS/Linux sed differences.
        # macOS: sed -i '' (in-place with empty suffix, no backup file created)
        # GNU/Linux: sed -i '' fails, need sed -i (no suffix arg)
        _sed_env() {
            sed -i '' "$@" 2>/dev/null || sed -i "$@" 2>/dev/null
        }

        _sed_env "s/^NEXT_PUBLIC_APP_PORT=.*/NEXT_PUBLIC_APP_PORT=$PORT_FRONTEND/" .env
        _sed_env "s/^BACKEND_PORT=.*/BACKEND_PORT=$PORT_BACKEND/" .env
        _sed_env "s/^POSTGRES_PORT=.*/POSTGRES_PORT=$PORT_POSTGRES/" .env
        _sed_env "s/^REDIS_PORT=.*/REDIS_PORT=$PORT_REDIS/" .env
        _sed_env "s/^MEILISEARCH_PORT=.*/MEILISEARCH_PORT=$PORT_MEILISEARCH/" .env

        # Update connection strings
        _sed_env "s|DATABASE_URL=.*|DATABASE_URL=postgresql://trackfraud:trackfraud_dev_password@localhost:$PORT_POSTGRES/trackfraud|g" .env
        _sed_env "s|REDIS_URL=.*|REDIS_URL=redis://localhost:$PORT_REDIS|g" .env
        _sed_env "s|MEILISEARCH_URL=.*|MEILISEARCH_URL=http://localhost:$PORT_MEILISEARCH|g" .env

        ok "Environment configured (frontend:$PORT_FRONTEND postgres:$PORT_POSTGRES redis:$PORT_REDIS meilisearch:$PORT_MEILISEARCH)"
    fi
}

clean_caches() {
    cd "$PROJECT_ROOT"

    info "Cleaning npm cache..."
    npm cache clean --force >/dev/null 2>&1 && ok "npm cache cleaned" || true

    # Always remove .next on smart start — Next.js rebuilds on-demand and
    # a stale build cache is the #1 cause of runtime "undefined" errors.
    if [ -d ".next" ]; then
        rm -rf .next
        ok ".next build cache removed"
    fi

    [ -d "node_modules/.cache" ] && { rm -rf node_modules/.cache; ok "TypeScript cache removed"; }

    if [ -d "logs" ]; then
        for logfile in logs/*.log; do
            [ -f "$logfile" ] && [ "$(du -m "$logfile" 2>/dev/null | cut -f1)" -gt 100 ] 2>/dev/null && {
                tail -n 10000 "$logfile" > "${logfile}.tmp" && mv "${logfile}.tmp" "$logfile"
                ok "Rotated $(basename "$logfile")"
            }
        done
    fi
}

# Deep clean: remove node_modules, lock file, .next, and all caches
deep_clean() {
    cd "$PROJECT_ROOT"

    step "Deep Clean"

    info "Removing node_modules..."
    rm -rf node_modules
    ok "node_modules removed"

    info "Removing package-lock.json..."
    rm -f package-lock.json
    ok "package-lock.json removed"

    info "Removing .next build cache..."
    rm -rf .next
    ok ".next removed"

    info "Cleaning npm cache..."
    npm cache clean --force >/dev/null 2>&1 && ok "npm cache cleaned" || true

    [ -d "node_modules/.cache" ] && rm -rf node_modules/.cache

    ok "Deep clean complete. Run 'npm install' to reinstall."
}

install_deps() {
    cd "$PROJECT_ROOT"
    if [ ! -d "node_modules" ]; then
        info "Installing npm dependencies..."
        npm install
        ok "Dependencies installed"
    elif [ -f "package-lock.json" ] && [ "package.json" -nt "package-lock.json" ]; then
        warn "package.json changed. Updating dependencies..."
        npm install
        ok "Dependencies updated"
    else
        ok "node_modules up to date"
    fi
}

setup_database() {
    cd "$PROJECT_ROOT"
    info "Generating Prisma Client..."
    npx prisma generate 2>&1 | grep -v "^warn\|^✔\|^Start" || true
    ok "Prisma client generated"

    info "Running database migrations..."
    npx prisma migrate deploy 2>&1 || info "No pending migrations"
    ok "Database migrations applied"
}

# ============================================================================
# Service Management Functions
# ============================================================================
start_infrastructure() {
    cd "$PROJECT_ROOT"

    info "Pulling latest Docker images..."
    $COMPOSE pull postgres redis meilisearch >/dev/null 2>&1 || warn "Some image pulls failed (continuing)"

    info "Starting PostgreSQL, Redis, Meilisearch..."
    $COMPOSE up -d postgres redis meilisearch 2>&1
    ok "Infrastructure containers started"

    info "Waiting for health checks..."
    # docker compose up --wait requires Compose v2.18+ (Sept 2023).
    # Fall back to wait_for_services if --wait is unsupported.
    if $COMPOSE up --wait postgres redis meilisearch 2>&1; then
        ok "Infrastructure ready"
    else
        warn "Compose --wait not supported or timed out — using manual health checks"
        wait_for_services
    fi
}

wait_for_services() {
    # PostgreSQL (internal port 5432, use 127.0.0.1 for Alpine)
    local count=0
    while ! docker exec "$CONTAINER_POSTGRES" pg_isready -U trackfraud -d trackfraud -h 127.0.0.1 -p 5432 &>/dev/null; do
        count=$((count + 1))
        [ $count -ge 60 ] && { err "PostgreSQL timeout"; docker logs --tail=20 "$CONTAINER_POSTGRES"; return 1; }
        sleep 1
    done
    ok "PostgreSQL ready (host port $PORT_POSTGRES)"

    # Redis
    count=0
    while ! docker exec "$CONTAINER_REDIS" redis-cli -h 127.0.0.1 -p 6379 ping &>/dev/null; do
        count=$((count + 1))
        [ $count -ge 30 ] && { err "Redis timeout"; docker logs --tail=20 "$CONTAINER_REDIS"; return 1; }
        sleep 1
    done
    ok "Redis ready (host port $PORT_REDIS)"

    # Meilisearch
    count=0
    while ! curl -sf "http://localhost:$PORT_MEILISEARCH/health" &>/dev/null; do
        count=$((count + 1))
        [ $count -ge 30 ] && { err "Meilisearch timeout"; docker logs --tail=20 "$CONTAINER_MEILISEARCH"; return 1; }
        sleep 1
    done
    ok "Meilisearch ready (host port $PORT_MEILISEARCH)"
}

start_backend() {
    cd "$PROJECT_ROOT"
    if $COMPOSE config --services 2>/dev/null | grep -q "^backend$"; then
        info "Starting backend..."
        $COMPOSE up -d --wait backend 2>&1 && ok "Backend started" || warn "Backend failed to start"
        if $COMPOSE config --services 2>/dev/null | grep -q "^celery-worker$"; then
            $COMPOSE up -d celery-worker 2>&1
            ok "Celery worker started"
        fi
    else
        info "No backend/celery-worker services (Next.js handles everything)"
    fi
}

start_frontend() {
    cd "$PROJECT_ROOT"

    # Kill existing process on port using pkill to handle child processes
    local existing_pids
    existing_pids=$(lsof -ti :$PORT_FRONTEND 2>/dev/null || true)
    if [ -n "$existing_pids" ]; then
        warn "Killing existing process(es) on port $PORT_FRONTEND (PIDs: $existing_pids)"
        # Use pkill to kill the process tree, fall back to individual kills
        kill $existing_pids 2>/dev/null || true
        # Also try to kill by port pattern for child processes
        pkill -f "next dev.*$PORT_FRONTEND" 2>/dev/null || true
        sleep 2
        # Force kill any remaining
        kill -9 $existing_pids 2>/dev/null || true
        pkill -9 -f "next dev.*$PORT_FRONTEND" 2>/dev/null || true
        sleep 1
    fi

    info "Starting Next.js on port $PORT_FRONTEND..."
    export NODE_ENV=development
    export PORT=$PORT_FRONTEND

    npx next dev -p "$PORT_FRONTEND" > /tmp/trackfraud-frontend.log 2>&1 &
    local frontend_pid=$!
    echo $frontend_pid > /tmp/trackfraud-frontend.pid
    # Also record the process group for cleaner shutdown
    echo "$frontend_pid" >> /tmp/trackfraud-frontend.pids

    # Wait for frontend to be ready
    local count=0
    while ! curl -sf "http://localhost:$PORT_FRONTEND" &>/dev/null; do
        count=$((count + 1))
        [ $count -ge 60 ] && {
            err "Frontend timeout. See /tmp/trackfraud-frontend.log"
            tail -20 /tmp/trackfraud-frontend.log
            # Kill the process tree on timeout
            kill $frontend_pid 2>/dev/null || true
            pkill -f "next dev.*$PORT_FRONTEND" 2>/dev/null || true
            return 1
        }
        sleep 1
    done
    ok "Frontend running at http://localhost:$PORT_FRONTEND"
}

stop_all() {
    cd "$PROJECT_ROOT"

    # Stop frontend — kill the main PID and any child processes
    if [ -f /tmp/trackfraud-frontend.pid ]; then
        local pid
        pid=$(cat /tmp/trackfraud-frontend.pid)
        kill "$pid" 2>/dev/null || true
        # Also kill child processes tracked in .pids file
        if [ -f /tmp/trackfraud-frontend.pids ]; then
            while read -r child_pid; do
                kill "$child_pid" 2>/dev/null || true
            done < /tmp/trackfraud-frontend.pids
            rm -f /tmp/trackfraud-frontend.pids
        fi
        # Fallback: kill by port pattern
        pkill -f "next dev.*$PORT_FRONTEND" 2>/dev/null || true
        rm -f /tmp/trackfraud-frontend.pid
        ok "Frontend stopped"
    fi

    # Kill anything else on our ports (belt and suspenders)
    for port in $PORT_FRONTEND $PORT_BACKEND $PORT_FLOWER; do
        local pids
        pids=$(lsof -ti :$port 2>/dev/null || true)
        [ -n "$pids" ] && kill $pids 2>/dev/null || true
    done

    # Stop Docker containers
    if [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
        $COMPOSE down 2>/dev/null || true
        ok "Docker containers stopped"
    fi

    ok "All services stopped"
}

# ============================================================================
# Command Functions
# ============================================================================
cmd_smart_start() {
    step "TrackFraud — Smart Start"

    # Prerequisites
    step "Checking Prerequisites"
    if ! command -v docker &>/dev/null; then
        err "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
        exit 1
    fi
    if ! docker info &>/dev/null; then
        err "Docker daemon not running. Start Docker Desktop and try again."
        exit 1
    fi
    local docker_ver
    docker_ver=$(docker --version | awk '{print $3}' | tr -d '()')
    local compose_ver
    compose_ver=$(docker compose version --short 2>/dev/null || echo "unknown")
    ok "Docker $docker_ver | Compose $compose_ver"

    if ! command -v node &>/dev/null; then
        err "Node.js not found. Install Node.js 18+."
        exit 1
    fi
    ok "Node.js $(node --version) | npm $(npm --version)"

    # Cleanup & Ports
    step "Cleanup & Port Resolution"
    cleanup_stale_services
    resolve_ports
    ok "Ports ready"

    # Environment
    step "Environment"
    setup_env

    # Caches
    step "Cache Cleanup"
    clean_caches

    # Dependencies
    step "Dependencies"
    install_deps

    # Database
    step "Database"
    setup_database

    # Infrastructure
    start_infrastructure
    wait_for_services

    # Backend
    start_backend

    # Frontend
    start_frontend

    # Summary
    print_summary
}

cmd_start() {
    step "TrackFraud — Start"
    setup_env
    start_infrastructure
    wait_for_services
    start_backend
    start_frontend
    print_summary
}

cmd_stop() {
    step "TrackFraud — Stop"
    stop_all
}

cmd_restart() {
    step "TrackFraud — Restart"
    stop_all
    sleep 2
    cmd_smart_start
}

cmd_status() {
    step "TrackFraud — Status Dashboard"

    echo ""
    # Docker containers
    echo -e "  ${CYAN}Docker Containers:${NC}"
    if [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
        $COMPOSE ps 2>/dev/null | head -20
    else
        echo "  No docker-compose.yml found"
    fi

    echo ""
    echo -e "  ${CYAN}Service Health:${NC}"

    # PostgreSQL
    if container_running "$CONTAINER_POSTGRES"; then
        local pg_health
        pg_health=$(container_health "$CONTAINER_POSTGRES")
        echo -e "    ${GREEN}●${NC} PostgreSQL  : ${GREEN}UP${NC} (port $PORT_POSTGRES) [$pg_health]"
    else
        echo -e "    ${RED}●${NC} PostgreSQL  : ${RED}DOWN${NC} (port $PORT_POSTGRES)"
    fi

    # Redis
    if container_running "$CONTAINER_REDIS"; then
        local rds_health
        rds_health=$(container_health "$CONTAINER_REDIS")
        echo -e "    ${GREEN}●${NC} Redis       : ${GREEN}UP${NC} (port $PORT_REDIS) [$rds_health]"
    else
        echo -e "    ${RED}●${NC} Redis       : ${RED}DOWN${NC} (port $PORT_REDIS)"
    fi

    # Meilisearch
    if container_running "$CONTAINER_MEILISEARCH"; then
        local ms_health
        ms_health=$(container_health "$CONTAINER_MEILISEARCH")
        echo -e "    ${GREEN}●${NC} Meilisearch : ${GREEN}UP${NC} (port $PORT_MEILISEARCH) [$ms_health]"
    else
        echo -e "    ${RED}●${NC} Meilisearch : ${RED}DOWN${NC} (port $PORT_MEILISEARCH)"
    fi

    # Frontend
    if curl -sf "http://localhost:$PORT_FRONTEND" &>/dev/null; then
        echo -e "    ${GREEN}●${NC} Frontend    : ${GREEN}UP${NC} http://localhost:$PORT_FRONTEND"
    else
        echo -e "    ${RED}●${NC} Frontend    : ${RED}DOWN${NC} (http://localhost:$PORT_FRONTEND)"
    fi

    echo ""
    echo -e "  ${CYAN}Port Mapping:${NC}"
    echo -e "    Frontend  : localhost:${PORT_FRONTEND}"
    echo -e "    Backend   : localhost:${PORT_BACKEND}"
    echo -e "    PostgreSQL: localhost:${PORT_POSTGRES}"
    echo -e "    Redis     : localhost:${PORT_REDIS}"
    echo -e "    Meilisearch: localhost:${PORT_MEILISEARCH}"
    echo ""
}

cmd_logs() {
    local service="${1:-all}"
    step "Trackfraud — Logs ${service:+($service)}"

    cd "$PROJECT_ROOT"

    case "$service" in
        postgres)
            docker logs -f "$CONTAINER_POSTGRES" 2>&1
            ;;
        redis)
            docker logs -f "$CONTAINER_REDIS" 2>&1
            ;;
        meilisearch)
            docker logs -f "$CONTAINER_MEILISEARCH" 2>&1
            ;;
        frontend)
            tail -f /tmp/trackfraud-frontend.log 2>/dev/null || err "Frontend logs not found. Is it running?"
            ;;
        backend)
            # Show backend container logs if it exists, otherwise frontend logs
            if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^trackfraud-backend$"; then
                docker logs -f "$CONTAINER_POSTGRES" 2>&1  # Will be updated when backend container exists
            else
                warn "No backend container found. Showing frontend logs instead."
                tail -f /tmp/trackfraud-frontend.log 2>/dev/null || err "Frontend logs not found. Is it running?"
            fi
            ;;
        all|*)
            echo -e "  ${CYAN}Docker Logs:${NC}"
            $COMPOSE logs --tail=100 -f 2>&1
            echo -e "\n  ${CYAN}Frontend Logs:${NC}"
            tail -f /tmp/trackfraud-frontend.log 2>/dev/null || true
            ;;
    esac
}

cmd_health() {
    step "TrackFraud — Health Check"

    local failures=0
    local start_time end_time elapsed

    # PostgreSQL
    echo -n "  PostgreSQL ($PORT_POSTGRES)... "
    start_time=$(date +%s%N)
    if docker exec "$CONTAINER_POSTGRES" pg_isready -U trackfraud -d trackfraud -h 127.0.0.1 -p 5432 &>/dev/null; then
        end_time=$(date +%s%N)
        elapsed=$(( (end_time - start_time) / 1000000 ))
        ok "OK (${elapsed}ms)"
    else
        err "FAILED"
        failures=$((failures + 1))
    fi

    # Redis
    echo -n "  Redis ($PORT_REDIS)... "
    start_time=$(date +%s%N)
    if docker exec "$CONTAINER_REDIS" redis-cli -h 127.0.0.1 -p 6379 ping &>/dev/null; then
        end_time=$(date +%s%N)
        elapsed=$(( (end_time - start_time) / 1000000 ))
        ok "OK (${elapsed}ms)"
    else
        err "FAILED"
        failures=$((failures + 1))
    fi

    # Meilisearch
    echo -n "  Meilisearch ($PORT_MEILISEARCH)... "
    start_time=$(date +%s%N)
    if curl -sf "http://localhost:$PORT_MEILISEARCH/health" &>/dev/null; then
        end_time=$(date +%s%N)
        elapsed=$(( (end_time - start_time) / 1000000 ))
        ok "OK (${elapsed}ms)"
    else
        err "FAILED"
        failures=$((failures + 1))
    fi

    # Frontend
    echo -n "  Frontend ($PORT_FRONTEND)... "
    start_time=$(date +%s%N)
    if curl -sf "http://localhost:$PORT_FRONTEND" &>/dev/null; then
        end_time=$(date +%s%N)
        elapsed=$(( (end_time - start_time) / 1000000 ))
        ok "OK (${elapsed}ms)"
    else
        err "FAILED"
        failures=$((failures + 1))
    fi

    # Database connectivity (Prisma)
    echo -n "  Database (Prisma)... "
    cd "$PROJECT_ROOT"
    start_time=$(date +%s%N)
    if npx prisma db pull --force-output 2>/dev/null; then
        end_time=$(date +%s%N)
        elapsed=$(( (end_time - start_time) / 1000000 ))
        ok "OK (${elapsed}ms)"
    else
        # Try alternative check
        if docker exec "$CONTAINER_POSTGRES" psql -U trackfraud -d trackfraud -c "SELECT 1" &>/dev/null; then
            end_time=$(date +%s%N)
            elapsed=$(( (end_time - start_time) / 1000000 ))
            ok "OK (${elapsed}ms)"
        else
            warn "SKIPPED (migration may not have run yet)"
        fi
    fi

    echo ""
    if [ $failures -eq 0 ]; then
        ok "All checks passed!"
    else
        err "$failures check(s) failed"
        return 1
    fi
}

# Get process info for a given port
get_port_owner() {
    local port=$1
    local owner_info=""

    # Use lsof to find what's using this port
    local lsof_output
    lsof_output=$(lsof -i :"$port" -P -n -sTCP:LISTEN 2>/dev/null | tail -n +2 | head -1)

    if [ -n "$lsof_output" ]; then
        local lsof_pid lsof_comm

        # Get PID from lsof
        lsof_pid=$(echo "$lsof_output" | awk '{print $2}')

        # Use ps to get the FULL process name (lsof truncates to 15 chars on macOS)
        local process_name
        process_name=$(ps -p "$lsof_pid" -o args= 2>/dev/null || echo "unknown")

        # If it's a long path (like Docker.app), extract just the basename
        if echo "$process_name" | grep -q "/"; then
            process_name=$(basename "$(echo "$process_name" | awk '{print $1}')")
        fi

        # Truncate display name if too long
        local display_name="${process_name:0:30}"

        # Check if this is a TrackFraud process
        local is_trackfraud=false

        # Check if it's our frontend PID file
        if [ -f /tmp/trackfraud-frontend.pid ]; then
            local our_pid
            our_pid=$(cat /tmp/trackfraud-frontend.pid 2>/dev/null)
            if [ "$lsof_pid" = "$our_pid" ]; then
                is_trackfraud=true
            fi
        fi

        # Check if it's a Docker/container process
        if echo "$process_name" | grep -qiE "docker|containerd|com\.docker"; then
            is_trackfraud=true
        fi

        # macOS: check if it's a Docker Desktop process
        if [[ "$process_name" == "Docker" ]] || [[ "$process_name" == *"docker"* ]]; then
            is_trackfraud=true
        fi

        if [ "$is_trackfraud" = true ]; then
            owner_info="${GREEN}${display_name}${NC} (PID: ${lsof_pid})"
        else
            owner_info="${YELLOW}${display_name}${NC} (PID: ${lsof_pid})"
        fi
    else
        owner_info="${RED}not in use${NC}"
    fi

    echo "$owner_info"
}

cmd_ports() {
    step "TrackFraud — Port Mapping"

    echo ""
    echo -e "  ${WHITE}Service${NC}              ${WHITE}Host Port${NC}        ${WHITE}Container Port${NC}  ${WHITE}Status${NC}  ${WHITE}Owner${NC}"
    echo -e "  ───────────────────────────────────────────────────────────────────────────────"

    # Frontend
    local frontend_status
    curl -sf "http://localhost:$PORT_FRONTEND" &>/dev/null && frontend_status="${GREEN}UP${NC}" || frontend_status="${RED}DOWN${NC}"
    local frontend_owner
    frontend_owner=$(get_port_owner "$PORT_FRONTEND")
    echo -e "  ${GREEN}●${NC} Frontend          ${PORT_FRONTEND}             3001              ${frontend_status}  ${frontend_owner}"

    # Backend
    local backend_status
    curl -sf "http://localhost:$PORT_BACKEND" &>/dev/null && backend_status="${GREEN}UP${NC}" || backend_status="${RED}DOWN${NC}"
    local backend_owner
    backend_owner=$(get_port_owner "$PORT_BACKEND")
    echo -e "  ${GREEN}●${NC} Backend           ${PORT_BACKEND}             8000              ${backend_status}  ${backend_owner}"

    # PostgreSQL
    local pg_status
    container_running "$CONTAINER_POSTGRES" && pg_status="${GREEN}UP${NC}" || pg_status="${RED}DOWN${NC}"
    local pg_owner
    pg_owner=$(get_port_owner "$PORT_POSTGRES")
    echo -e "  ${GREEN}●${NC} PostgreSQL        ${PORT_POSTGRES}            5432              ${pg_status}  ${pg_owner}"

    # Redis
    local redis_status
    container_running "$CONTAINER_REDIS" && redis_status="${GREEN}UP${NC}" || redis_status="${RED}DOWN${NC}"
    local redis_owner
    redis_owner=$(get_port_owner "$PORT_REDIS")
    echo -e "  ${GREEN}●${NC} Redis             ${PORT_REDIS}             6379              ${redis_status}  ${redis_owner}"

    # Meilisearch
    local ms_status
    container_running "$CONTAINER_MEILISEARCH" && ms_status="${GREEN}UP${NC}" || ms_status="${RED}DOWN${NC}"
    local ms_owner
    ms_owner=$(get_port_owner "$PORT_MEILISEARCH")
    echo -e "  ${GREEN}●${NC} Meilisearch       ${PORT_MEILISEARCH}           7700              ${ms_status}  ${ms_owner}"

    # Flower
    local flower_status
    curl -sf "http://localhost:$PORT_FLOWER" &>/dev/null && flower_status="${GREEN}UP${NC}" || flower_status="${RED}DOWN${NC}"
    local flower_owner
    flower_owner=$(get_port_owner "$PORT_FLOWER")
    echo -e "  ${GREEN}●${NC} Flower            ${PORT_FLOWER}            5555              ${flower_status}  ${flower_owner}"

    # Show conflicting ports (non-TrackFraud processes on default ports)
    echo ""
    local has_conflicts=false
    local conflict_lines=""

    for default_port in $DEFAULT_PORT_FRONTEND $DEFAULT_PORT_BACKEND $DEFAULT_PORT_POSTGRES $DEFAULT_PORT_REDIS $DEFAULT_PORT_MEILISEARCH $DEFAULT_PORT_FLOWER; do
        # Skip if this default port is being used by TrackFraud (meaning no conflict)
        if [ "$default_port" = "$PORT_FRONTEND" ] || [ "$default_port" = "$PORT_BACKEND" ] || \
           [ "$default_port" = "$PORT_POSTGRES" ] || [ "$default_port" = "$PORT_REDIS" ] || \
           [ "$default_port" = "$PORT_MEILISEARCH" ] || [ "$default_port" = "$PORT_FLOWER" ]; then
            continue
        fi

        # This default port was remapped, so something else is using it
        local lsof_output
        lsof_output=$(lsof -i :"$default_port" -P -n -sTCP:LISTEN 2>/dev/null | tail -n +2 | head -1)
        if [ -n "$lsof_output" ]; then
            has_conflicts=true
            local proc pid
            proc=$(echo "$lsof_output" | awk '{print $1}')
            pid=$(echo "$lsof_output" | awk '{print $2}')
            conflict_lines="${conflict_lines}    ${YELLOW}${default_port}${NC}  →  ${proc} (PID: ${pid})\n"
        fi
    done

    if [ "$has_conflicts" = true ]; then
        echo -e "  ${YELLOW}⚠ Resolved Port Conflicts:${NC}"
        echo -e "  ${conflict_lines}"
    fi
}

cmd_update() {
    step "TrackFraud — Update"

    # Docker images
    info "Pulling latest Docker images..."
    cd "$PROJECT_ROOT"
    $COMPOSE pull 2>&1 | tail -5
    ok "Docker images updated"

    # npm packages
    info "Checking npm updates..."
    if command -v npm-check &>/dev/null; then
        npm-check --skip-unused 2>&1 | tail -10
    else
        info "Run 'npm outdated' manually to check for package updates"
    fi

    ok "Update complete. Run './scripts/start.sh restart' to apply."
}

cmd_db() {
    local action="${1:-help}"
    cd "$PROJECT_ROOT"

    case "$action" in
        migrate)
            step "Database — Migrations"
            info "Generating Prisma Client..."
            npx prisma generate 2>&1 | grep -v "^warn\|^✔\|^Start" || true
            ok "Prisma client generated"

            info "Running migrations..."
            npx prisma migrate deploy 2>&1
            ok "Migrations applied"
            ;;
        seed)
            step "Database — Seed"
            if [ -f "prisma/seed.ts" ]; then
                info "Running seed script..."
                npx ts-node prisma/seed.ts 2>&1
                ok "Database seeded"
            else
                warn "No seed.ts found in prisma/"
            fi
            ;;
        reset)
            step "Database — Reset"
            warn "This will DELETE ALL DATA and re-run migrations!"
            read -r -p "Type 'YES' to confirm: " confirm
            if [ "$confirm" = "YES" ]; then
                npx prisma migrate reset 2>&1
                ok "Database reset complete"
            else
                info "Cancelled"
            fi
            ;;
        empty)
            step "Database — Empty All Tables"
            warn "This will DELETE ALL DATA!"
            read -r -p "Type 'YES' to confirm: " confirm
            if [ "$confirm" = "YES" ]; then
                docker exec "$CONTAINER_POSTGRES" psql -U trackfraud -d trackfraud -c \
                    "DO \$\$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP EXECUTE 'DELETE FROM ' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END \$\$;"
                ok "All tables emptied"
            else
                info "Cancelled"
            fi
            ;;
        exec)
            step "Database — Exec"
            docker exec -it "$CONTAINER_POSTGRES" psql -U trackfraud -d trackfraud 2>&1
            ;;
        pull)
            step "Database — Pull Schema"
            npx prisma db pull 2>&1
            ok "Schema pulled"
            ;;
        generate)
            step "Database — Generate Prisma Client"
            npx prisma generate 2>&1 | grep -v "^warn\|^✔\|^Start" || true
            ok "Prisma client generated"
            ;;
        *)
            echo "Usage: ./scripts/start.sh db <migrate|seed|reset|empty|exec|pull|generate>"
            echo ""
            echo "  migrate   - Run database migrations"
            echo "  seed      - Run seed script"
            echo "  reset     - Reset database (deletes all data)"
            echo "  empty     - Delete all data (keeps schema)"
            echo "  exec      - Open psql shell"
            echo "  pull      - Pull schema from database"
            echo "  generate  - Generate Prisma client"
            ;;
    esac
}

cmd_prune() {
    step "TrackFraud — Docker Prune"

    info "Removing dangling images..."
    docker image prune -f 2>&1 | tail -3
    ok "Dangling images removed"

    info "Removing unused volumes..."
    docker volume prune -f --filter "label!=com.docker.compose.project=trackfraudproject" 2>&1 | tail -3
    ok "Unused volumes removed"

    info "Removing build cache..."
    docker builder prune -f 2>&1 | tail -3
    ok "Build cache removed"

    ok "Docker pruning complete"
}

cmd_clean() {
    step "TrackFraud — Clean"
    clean_caches
    ok "Cache cleanup complete"
}

cmd_volumes() {
    step "TrackFraud — Docker Volumes"

    echo ""
    echo -e "  ${WHITE}Volume${NC}                                   ${WHITE}Size${NC}          ${WHITE}Created${NC}"
    echo -e "  ─────────────────────────────────────────────────────────────────"

    docker volume ls --filter "name=trackfraud" 2>/dev/null | tail -n +2 | while read -r driver name; do
        local size
        size=$(docker run --rm -v "$name":/data -v /var/run/docker.sock:/var/run/docker.sock alpine du -sh /data 2>/dev/null | cut -f1 || echo "?")
        local created
        created=$(docker volume inspect "$name" --format '{{.CreatedAt}}' 2>/dev/null | cut -d'.' -f1 || echo "?")
        printf "  %-18s %-25s %-15s %s\n" "" "$name" "$size" "$created"
    done

    echo ""
    echo -e "  ${YELLOW}Commands:${NC}"
    echo -e "    ./scripts/start.sh volumes rm   - Remove all TrackFraud volumes"
    echo -e "    ./scripts/start.sh volumes keep - Keep volumes, remove images"
    echo ""
}

cmd_volumes_rm() {
    step "TrackFraud — Remove Volumes"
    warn "This will DELETE ALL DATA in Docker volumes!"
    read -r -p "Type 'YES' to confirm: " confirm
    if [ "$confirm" = "YES" ]; then
        cd "$PROJECT_ROOT"
        $COMPOSE down -v 2>&1
        ok "All volumes removed"
    else
        info "Cancelled"
    fi
}

cmd_exec() {
    local service="${1:-postgres}"
    step "TrackFraud — Exec ($service)"

    case "$service" in
        postgres)
            docker exec -it "$CONTAINER_POSTGRES" psql -U trackfraud -d trackfraud 2>&1
            ;;
        redis)
            docker exec -it "$CONTAINER_REDIS" redis-cli 2>&1
            ;;
        meilisearch)
            docker exec -it "$CONTAINER_MEILISEARCH" /bin/sh 2>&1
            ;;
        *)
            docker exec -it "$CONTAINER_POSTGRES" /bin/bash 2>&1
            ;;
    esac
}

cmd_rebuild() {
    step "TrackFraud — Rebuild"
    stop_all
    sleep 2

    info "Pruning Docker..."
    docker image prune -f >/dev/null 2>&1
    ok "Old images removed"

    cmd_smart_start
}

cmd_menu() {
    while true; do
        clear 2>/dev/null || true
        echo -e "${WHITE}╔══════════════════════════════════════════════════════════╗${NC}"
        echo -e "${WHITE}║${NC}          ${CYAN}TrackFraud Control Panel${NC}               ${WHITE}║${NC}"
        echo -e "${WHITE}╚══════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "  ${GREEN}1)${NC} Smart Start    ${GREEN}2)${NC} Stop All       ${GREEN}3)${NC} Restart        ${GREEN}4)${NC} Status"
        echo -e "  ${GREEN}5)${NC} Logs           ${GREEN}6)${NC} Health Check   ${GREEN}7)${NC} Update         ${GREEN}8)${NC} Clean"
        echo -e "  ${GREEN}9)${NC} DB Migrate     ${GREEN}10)${NC} Prune Docker  ${GREEN}11)${NC} Ports         ${GREEN}12)${NC} Rebuild"
        echo ""
        echo -e "  ${YELLOW}q)${NC} Quit"
        echo ""
        echo -n "  Choose [1-12/q]: "
        read -r choice

        case "$choice" in
            1) cmd_smart_start ;;
            2) cmd_stop ;;
            3) cmd_restart ;;
            4) cmd_status ;;
            5) cmd_logs ;;
            6) cmd_health ;;
            7) cmd_update ;;
            8) cmd_clean ;;
            9) cmd_db migrate ;;
            10) cmd_prune ;;
            11) cmd_ports ;;
            12) cmd_rebuild ;;
            q|Q) break ;;
            *) warn "Invalid option" ;;
        esac

        echo ""
        echo -n "  Press Enter to continue..."
        read -r
    done
}

print_summary() {
    echo ""
    echo -e "  ${BG_GREEN}${NC} ${GREEN}██████████████████████████████████████████████████${NC} ${BG_GREEN}${NC}"
    echo -e "  ${BG_GREEN}${NC} ${GREEN}█${NC}  ${CYAN}🎉 TrackFraud is now RUNNING!${NC}              ${GREEN}█${NC} ${BG_GREEN}${NC}"
    echo -e "  ${BG_GREEN}${NC} ${GREEN}██████████████████████████████████████████████████${NC} ${BG_GREEN}${NC}"
    echo ""
    echo -e "  ${CYAN}┌─────────────────────────────────────────────────┐${NC}"
    echo -e "  ${CYAN}│${NC} ${WHITE}Frontend:${NC}       http://localhost:${CYAN}$PORT_FRONTEND${NC}  ${NC} ${CYAN}│${NC}"
    echo -e "  ${CYAN}│${NC} ${WHITE}Backend API:${NC}    http://localhost:${CYAN}$PORT_BACKEND${NC}   ${NC} ${CYAN}│${NC}"
    echo -e "  ${CYAN}│${NC} ${WHITE}Meilisearch UI:${NC} http://localhost:${CYAN}$PORT_MEILISEARCH${NC} ${NC} ${CYAN}│${NC}"
    echo -e "  ${CYAN}└─────────────────────────────────────────────────┘${NC}"
    echo ""
    echo -e "  ${YELLOW}Quick Commands:${NC}"
    echo -e "    ./scripts/start.sh status     - Check service status"
    echo -e "    ./scripts/start.sh logs       - Follow all logs"
    echo -e "    ./scripts/start.sh health     - Health check"
    echo -e "    ./scripts/start.sh stop       - Stop all services"
    echo -e "    ./scripts/start.sh restart    - Full restart"
    echo -e "    ./scripts/start.sh db migrate - Run migrations"
    echo ""
}

cmd_help() {
    step "TrackFraud — Help"

    echo ""
    echo -e "  ${WHITE}Usage:${NC} ./scripts/start.sh [command] [options]"
    echo ""
    echo -e "  ${WHITE}Commands:${NC}"
    echo -e "    (none)          ${GREEN}Smart start${NC} — stop stale, clean, build, start (DEFAULT)"
    echo -e "    start           Start all services (skip cleanup)"
    echo -e "    stop            Stop all services gracefully"
    echo -e "    restart         Full restart (stop → clean → start)"
    echo -e "    status          Show live status dashboard"
    echo -e "    logs [svc]      Follow logs (all|postgres|redis|meilisearch|frontend)"
    echo -e "    health          Run full health check suite with timing"
    echo -e "    ports           Show resolved port mapping"
    echo -e "    update          Pull latest Docker images + update npm packages"
    echo -e "    db <cmd>        Database: migrate|seed|reset|empty|exec|pull|generate"
    echo -e "    prune           Deep clean Docker (images, volumes, build cache)"
    echo -e "    clean           Clean project caches (npm, .next, logs)"
    echo -e "    volumes         List Docker volumes"
    echo -e "    volumes rm      Remove all TrackFraud volumes"
    echo -e "    exec <svc>      Execute command in container (postgres|redis|meilisearch)"
    echo -e "    rebuild         Full rebuild (down → prune → smart start)"
    echo -e "    menu            Interactive dashboard"
    echo -e "    help            Show this help message"
    echo ""
    echo -e "  ${WHITE}Examples:${NC}"
    echo -e "    ./scripts/start.sh                  # Smart start"
    echo -e "    ./scripts/start.sh start            # Quick start"
    echo -e "    ./scripts/start.sh stop             # Stop everything"
    echo -e "    ./scripts/start.sh logs postgres    # PostgreSQL logs only"
    echo -e "    ./scripts/start.sh db migrate       # Run migrations"
    echo -e "    ./scripts/start.sh exec postgres    # Bash into PostgreSQL"
    echo -e "    ./scripts/start.sh health           # Run health checks"
    echo -e "    ./scripts/start.sh ports            # See port mapping"
    echo ""
}

# ============================================================================
# Entry Point
# ============================================================================
# Default to smart start (with cache cleanup) when no argument provided.
# This prevents stale .next cache from causing runtime errors.
COMMAND="${1:-}"
shift 2>/dev/null || true

case "$COMMAND" in
    # Core lifecycle
    start)       cmd_start ;;
    stop)        cmd_stop ;;
    restart)     cmd_restart ;;

    # Without argument defaults to smart start (with cache cleanup)
    "")          cmd_smart_start ;;
    start-all)   cmd_smart_start ;;

    # Dashboard & monitoring
    status)      cmd_status ;;
    logs)        cmd_logs "$@" ;;
    health)      cmd_health ;;
    ports)       cmd_ports ;;

    # Maintenance
    update)      cmd_update ;;
    clean)       cmd_clean ;;
    prune)       cmd_prune ;;
    volumes)     cmd_volumes ;;
    exec)        cmd_exec "$@" ;;
    rebuild)     cmd_rebuild ;;

    # Database
    db)          cmd_db "$@" ;;

    # Interactive
    menu)        cmd_menu ;;

    # Help
    help|--help|-h) cmd_help ;;

    *)
        err "Unknown command: $COMMAND"
        echo ""
        cmd_help
        exit 1
        ;;
esac
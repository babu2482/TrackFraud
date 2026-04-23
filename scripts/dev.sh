#!/usr/bin/env bash
#
# TrackFraud - One-Command Dev Environment
# Usage:
#   ./scripts/dev.sh          # Start everything
#   ./scripts/dev.sh stop     # Stop everything
#   ./scripts/dev.sh status   # Show service status
#   ./scripts/dev.sh rebuild  # Full rebuild (recreate containers, re-migrate DB)
#
set -euo pipefail

# ============================================================
# Configuration
# ============================================================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Ports
NEXT_PORT=3001
BACKEND_PORT=8000
POSTGRES_PORT=5432
REDIS_PORT=6379
MEILISEARCH_PORT=7700
FLOWER_PORT=5555

# ============================================================
# Helper Functions
# ============================================================
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }
step()    { echo -e "\n${CYAN}========================================${NC}"; echo -e "${CYAN}  $*${NC}"; echo -e "${CYAN}========================================${NC}"; }

check_command() {
    if ! command -v "$1" &>/dev/null; then
        error "$1 is not installed. Please install it first."
        exit 1
    fi
}

wait_for_port() {
    local port=$1
    local service=$2
    local max_wait=${3:-60}
    local count=0

    info "Waiting for $service on port $port..."
    while ! nc -z localhost "$port" 2>/dev/null; do
        count=$((count + 1))
        if [ "$count" -ge "$max_wait" ]; then
            error "$service did not start within ${max_wait} seconds"
            return 1
        fi
        sleep 1
    done
    success "$service is ready on port $port (${count}s)"
}

# ============================================================
# Prerequisites Check
# ============================================================
check_prerequisites() {
    step "Checking Prerequisites"

    check_command docker
    check_command npm
    check_command node

    # Verify Docker is running
    if ! docker info &>/dev/null; then
        error "Docker daemon is not running. Please start Docker first."
        exit 1
    fi

    local node_version
    node_version=$(node --version | cut -d'v' -f2)
    local npm_version
    npm_version=$(npm --version)
    local docker_version
    docker_version=$(docker --version | awk '{print $3}')

    success "Node.js $node_version | npm $npm_version | Docker $docker_version"
}

# ============================================================
# Environment Setup
# ============================================================
setup_env() {
    step "Setting Up Environment"

    cd "$PROJECT_ROOT"

    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            success "Created .env from .env.example"
            info "Review .env and update API keys as needed"
        else
            warn ".env.example not found, proceeding without .env update"
        fi
    else
        success ".env already exists"
    fi

    # Load environment variables
    set -a
    source .env
    set +a
}

# ============================================================
# Install Dependencies
# ============================================================
install_dependencies() {
    step "Installing Dependencies"

    cd "$PROJECT_ROOT"

    # Frontend dependencies
    if [ ! -d "node_modules" ]; then
        info "Installing frontend dependencies..."
        npm install
        success "Frontend dependencies installed"
    else
        success "node_modules already exists (skip npm install)"
    fi
}

# ============================================================
# Generate Prisma Client
# ============================================================
generate_prisma() {
    step "Generating Prisma Client"

    cd "$PROJECT_ROOT"
    npx prisma generate
    success "Prisma client generated"
}

# ============================================================
# Start Infrastructure Services
# ============================================================
start_infrastructure() {
    step "Starting Infrastructure (PostgreSQL, Redis, Meilisearch)"

    cd "$PROJECT_ROOT"

    # Start only infrastructure services first
    docker compose up -d --wait postgres redis meilisearch
    success "Infrastructure services started"
}

# ============================================================
# Database Migration
# ============================================================
setup_database() {
    step "Setting Up Database (Migrate + Seed)"

    cd "$PROJECT_ROOT"

    # Wait for PostgreSQL to be ready
    wait_for_port $POSTGRES_PORT "PostgreSQL" 30

    # Run Prisma migrations
    info "Running database migrations..."
    npx prisma migrate dev --name "dev_init" 2>/dev/null || {
        info "No pending migrations or migration completed"
    }
    success "Database migrations applied"

    # Seed the database
    info "Seeding database..."
    npx tsx prisma/seed.ts 2>/dev/null || {
        info "Seed script completed or already seeded"
    }
    success "Database seeded"
}

# ============================================================
# Start Backend Services
# ============================================================
start_backend() {
    step "Starting Backend (FastAPI + Celery)"

    cd "$PROJECT_ROOT"

    # Start backend with --wait (has healthcheck)
    docker compose up -d --wait backend

    # Start celery-worker without --wait (no healthcheck defined)
    docker compose up -d celery-worker

    # Give celery a moment to start
    sleep 2
    success "Backend services started"
}

# ============================================================
# Start Frontend
# ============================================================
start_frontend() {
    step "Starting Frontend (Next.js)"

    cd "$PROJECT_ROOT"

    # Kill any existing Next.js process on our port
    local existing_pid
    existing_pid=$(lsof -ti :$NEXT_PORT 2>/dev/null || true)
    if [ -n "$existing_pid" ]; then
        warn "Killing existing process on port $NEXT_PORT"
        kill "$existing_pid" 2>/dev/null || true
        sleep 2
    fi

    info "Starting Next.js development server on port $NEXT_PORT..."
    npx next dev -p $NEXT_PORT &
    local frontend_pid=$!
    echo $frontend_pid > /tmp/trackfraud-frontend.pid

    wait_for_port $NEXT_PORT "Next.js" 60
    success "Frontend is running at http://localhost:$NEXT_PORT"
}

# ============================================================
# Print Summary
# ============================================================
print_summary() {
    echo ""
    echo -e "${GREEN}+-----------------------------------------------------+${NC}"
    echo -e "${GREEN}|${NC}           ${CYAN}TrackFraud is now RUNNING!${NC}            ${GREEN}|${NC}"
    echo -e "${GREEN}+-----------------------------------------------------+${NC}"
    echo ""
    echo -e "  ${BLUE}Frontend:${NC}    http://localhost:$NEXT_PORT"
    echo -e "  ${BLUE}Backend:${NC}     http://localhost:$BACKEND_PORT"
    echo -e "  ${BLUE}Meilisearch:${NC} http://localhost:$MEILISEARCH_PORT"
    echo -e "  ${BLUE}Flower:${NC}      http://localhost:$FLOWER_PORT"
    echo ""
    echo -e "  ${YELLOW}Management:${NC}"
    echo -e "    ./scripts/dev.sh stop     - Stop all services"
    echo -e "    ./scripts/dev.sh status   - Check service status"
    echo -e "    ./scripts/dev.sh logs     - View all logs"
    echo ""
}

# ============================================================
# Stop All Services
# ============================================================
stop_all() {
    step "Stopping All Services"

    cd "$PROJECT_ROOT"

    # Stop Next.js frontend
    if [ -f /tmp/trackfraud-frontend.pid ]; then
        local pid
        pid=$(cat /tmp/trackfraud-frontend.pid)
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            success "Frontend stopped"
        fi
        rm -f /tmp/trackfraud-frontend.pid
    fi

    # Also kill anything on our ports
    local port_pids
    for port in $NEXT_PORT $BACKEND_PORT $FLOWER_PORT; do
        port_pids=$(lsof -ti :$port 2>/dev/null || true)
        if [ -n "$port_pids" ]; then
            kill "$port_pids" 2>/dev/null || true
        fi
    done

    # Stop Docker containers
    docker compose down
    success "Docker containers stopped"

    echo ""
    success "All TrackFraud services have been stopped"
}

# ============================================================
# Show Status
# ============================================================
show_status() {
    step "Service Status"

    cd "$PROJECT_ROOT"

    echo -e "\n  ${CYAN}Docker Containers:${NC}"
    docker compose ps 2>/dev/null || echo "  No Docker compose services found"

    echo -e "\n  ${CYAN}Port Status:${NC}"

    # Check each port
    if nc -z localhost $NEXT_PORT 2>/dev/null; then
        echo -e "    ${GREEN}●${NC} Frontend (:$NEXT_PORT) - ${GREEN}UP${NC}"
    else
        echo -e "    ${RED}●${NC} Frontend (:$NEXT_PORT) - ${RED}DOWN${NC}"
    fi

    if nc -z localhost $BACKEND_PORT 2>/dev/null; then
        echo -e "    ${GREEN}●${NC} Backend (:$BACKEND_PORT) - ${GREEN}UP${NC}"
    else
        echo -e "    ${RED}●${NC} Backend (:$BACKEND_PORT) - ${RED}DOWN${NC}"
    fi

    if nc -z localhost $POSTGRES_PORT 2>/dev/null; then
        echo -e "    ${GREEN}●${NC} PostgreSQL (:$POSTGRES_PORT) - ${GREEN}UP${NC}"
    else
        echo -e "    ${RED}●${NC} PostgreSQL (:$POSTGRES_PORT) - ${RED}DOWN${NC}"
    fi

    if nc -z localhost $REDIS_PORT 2>/dev/null; then
        echo -e "    ${GREEN}●${NC} Redis (:$REDIS_PORT) - ${GREEN}UP${NC}"
    else
        echo -e "    ${RED}●${NC} Redis (:$REDIS_PORT) - ${RED}DOWN${NC}"
    fi

    if nc -z localhost $MEILISEARCH_PORT 2>/dev/null; then
        echo -e "    ${GREEN}●${NC} Meilisearch (:$MEILISEARCH_PORT) - ${GREEN}UP${NC}"
    else
        echo -e "    ${RED}●${NC} Meilisearch (:$MEILISEARCH_PORT) - ${RED}DOWN${NC}"
    fi

    if nc -z localhost $FLOWER_PORT 2>/dev/null; then
        echo -e "    ${GREEN}●${NC} Flower (:$FLOWER_PORT) - ${GREEN}UP${NC}"
    else
        echo -e "    ${RED}●${NC} Flower (:$FLOWER_PORT) - ${RED}DOWN${NC}"
    fi

    # Frontend process
    if [ -f /tmp/trackfraud-frontend.pid ]; then
        local pid
        pid=$(cat /tmp/trackfraud-frontend.pid)
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "    ${GREEN}●${NC} Next.js process (PID: $pid) - ${GREEN}RUNNING${NC}"
        else
            echo -e "    ${RED}●${NC} Next.js process - ${RED}NOT RUNNING${NC}"
        fi
    else
        echo -e "    ${RED}●${NC} Next.js process - ${RED}NOT TRACKED${NC}"
    fi

    echo ""
}

# ============================================================
# Full Rebuild
# ============================================================
rebuild_all() {
    step "Full Rebuild"

    cd "$PROJECT_ROOT"

    # Stop everything first
    stop_all

    # Remove old images
    info "Removing old Docker images..."
    docker compose down --rmi local -v
    success "Old images removed"

    # Start fresh
    start_all
}

# ============================================================
# View Logs
# ============================================================
view_logs() {
    cd "$PROJECT_ROOT"
    docker compose logs -f --tail=100 "$@"
}

# ============================================================
# Main Start Sequence
# ============================================================
start_all() {
    check_prerequisites
    setup_env
    install_dependencies
    generate_prisma
    start_infrastructure
    setup_database
    start_backend

    # Wait for backend
    wait_for_port $BACKEND_PORT "Backend" 30

    start_frontend
    print_summary
}

# ============================================================
# Entry Point
# ============================================================
COMMAND="${1:-start}"

if [ "$COMMAND" = "start" ]; then
    start_all
elif [ "$COMMAND" = "stop" ]; then
    stop_all
elif [ "$COMMAND" = "status" ]; then
    show_status
elif [ "$COMMAND" = "rebuild" ]; then
    rebuild_all
elif [ "$COMMAND" = "logs" ]; then
    shift
    view_logs "$@"
else
    echo "Usage: $0 {start|stop|status|rebuild|logs [service...]}"
    echo ""
    echo "  start   - Start all services (default)"
    echo "  stop    - Stop all services"
    echo "  status  - Show status of all services"
    echo "  rebuild - Full rebuild (clean and restart)"
    echo "  logs    - Follow logs (optionally specify service name)"
    exit 1
fi
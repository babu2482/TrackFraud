"""
The Glass House API - Version 1 Router

This module sets up the main API router for v1 of The Glass House API.
It aggregates all endpoint routers into a single router that's mounted
at /api/v1 in the main FastAPI application.

All endpoints in this version are stable and backward-compatible.
Breaking changes will require a major version bump (v2).
"""

from fastapi import APIRouter

from .actions import router as actions_router
from .analytics import router as analytics_router
from .bills import router as bills_router
from .comparisons import router as comparisons_router
from .health import router as health_router

# Import endpoint routers (created as we build features)
from .politicians import router as politicians_router
from .promises import router as promises_router
from .search import router as search_router
from .transparency import router as transparency_router
from .votes import router as votes_router

# Create main v1 router
router = APIRouter(prefix="/v1", tags=["API v1"])

# Include all endpoint routers with their paths and tags
# Order matters - more specific routes should come before general ones

# Health & System
router.include_router(health_router, prefix="/health", tags=["Health & System"])

# Core Entities
router.include_router(politicians_router, prefix="/politicians", tags=["Politicians"])
router.include_router(actions_router, prefix="/actions", tags=["Actions"])
router.include_router(bills_router, prefix="/bills", tags=["Legislation"])
router.include_router(votes_router, prefix="/votes", tags=["Votes"])

# Promise Tracking (Actions vs Words)
router.include_router(promises_router, prefix="/promises", tags=["Promises"])

# Comparison & Analysis
router.include_router(comparisons_router, prefix="/compare", tags=["Comparisons"])
router.include_router(analytics_router, prefix="/analytics", tags=["Analytics"])

# Transparency Scores
router.include_router(
    transparency_router, prefix="/transparency", tags=["Transparency"]
)

# Search & Discovery
router.include_router(search_router, prefix="/search", tags=["Search"])

# Real-time Features (WebSocket endpoints would be in a separate module)
# router.include_router(realtime_router, prefix="/realtime", tags=["Real-Time"])

# Export router for use in main.py
__all__ = ["router"]

"""
The Glass House - Main API Router

Central router that combines all API endpoint sub-routers.
This is the main entry point for all API routes.
"""

from app.api.v1 import (
    analytics,
    auth,
    bills,
    compare,
    politicians,
    presidents,
    promises,
    search,
)
from fastapi import APIRouter

# Create main API router
api_router = APIRouter()

# Include all sub-routers
api_router.include_router(auth.router, prefix="/v1", tags=["auth"])
api_router.include_router(politicians.router, prefix="/v1", tags=["politicians"])
api_router.include_router(promises.router, prefix="/v1", tags=["promises"])
api_router.include_router(bills.router, prefix="/v1", tags=["bills"])
api_router.include_router(search.router, prefix="/v1", tags=["search"])
api_router.include_router(analytics.router, prefix="/v1", tags=["analytics"])
api_router.include_router(compare.router, prefix="/v1", tags=["compare"])
api_router.include_router(presidents.router, prefix="/v1", tags=["presidents"])

__all__ = ["api_router"]

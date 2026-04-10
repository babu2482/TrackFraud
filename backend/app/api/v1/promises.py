"""
Promises API Endpoints for The Glass House

This module provides RESTful endpoints for managing campaign promises and tracking
their fulfillment status. This is the core of the "Actions vs Words" feature.

Endpoints include:
- List promises with filtering, pagination, and search
- Get individual promise details with fulfillment tracking
- Create and update promises
- Get promise statistics and analytics
- Update fulfillment status and score
- Link promises to confirming actions

All endpoints use proper validation, error handling, and async where appropriate.
"""

from datetime import datetime, timedelta
from typing import List, Optional

from app.core.config import get_settings
from app.db.database import get_db
from app.db.models import (
    Action,
    Politician,
    Promise,
    PromiseMetric,
    PromiseStatus,
    PromiseUpdate,
    TransparencyScore,
)
from app.db.models import Evidence as EvidenceModel
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload

router = APIRouter()

settings = get_settings()


# ============================================================================
# Pydantic Schemas
# ============================================================================

from pydantic import BaseModel, Field


class PromiseBase(BaseModel):
    """Base promise schema"""

    promise_text: str
    promise_type: str = "campaign_pledge"
    category: Optional[str] = None
    topic_tags: Optional[list[str]] = None
    deadline: Optional[datetime] = None
    is_immediate: bool = False
    timeframe_text: Optional[str] = None
    source_url: Optional[str] = None
    source_type: Optional[str] = None


class PromiseCreate(PromiseBase):
    """Schema for creating a new promise"""

    politician_id: int
    context_before: Optional[str] = None
    context_after: Optional[str] = None
    full_context: Optional[str] = None
    claim_id: Optional[str] = None
    confidence_score: Optional[float] = None
    sentiment_score: Optional[float] = None


class PromiseUpdate(BaseModel):
    """Schema for updating a promise"""

    promise_text: Optional[str] = None
    promise_type: Optional[str] = None
    category: Optional[str] = None
    topic_tags: Optional[list[str]] = None
    deadline: Optional[datetime] = None
    timeframe_text: Optional[str] = None
    fulfillment_status: Optional[str] = None
    fulfillment_score: Optional[float] = Field(None, ge=0.0, le=100.0)
    fulfillment_progress: Optional[float] = Field(None, ge=0.0, le=100.0)
    source_url: Optional[str] = None
    is_immediate: Optional[bool] = None


class PromiseMetricCreate(BaseModel):
    """Schema for creating a promise metric"""

    metric_type: str
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    unit: Optional[str] = None
    threshold: Optional[float] = None
    evaluation_criteria: Optional[str] = None


class PromiseResponse(BaseModel):
    """Schema for promise list items"""

    id: int
    politician_id: int
    politician_name: str
    promise_text: str
    promise_date: datetime
    fulfillment_status: str
    fulfillment_score: float
    deadline: Optional[datetime]
    category: Optional[str]
    topic_tags: Optional[list[str]]
    is_past_deadline: bool

    class Config:
        from_attributes = True


class PromiseDetailResponse(BaseModel):
    """Schema for full promise details"""

    id: int
    politician_id: int
    politician_name: str
    office_title: str
    party: Optional[str]

    # Promise content
    promise_text: str
    promise_type: str
    category: Optional[str]
    topic_tags: Optional[list[str]]

    # Context
    context_before: Optional[str]
    context_after: Optional[str]
    full_context: Optional[str]

    # Timing
    promise_date: datetime
    deadline: Optional[datetime]
    is_immediate: bool
    timeframe_text: Optional[str]
    is_past_deadline: bool
    days_until_deadline: Optional[int]

    # AI Analysis
    claim_id: Optional[str]
    confidence_score: Optional[float]
    sentiment_score: Optional[float]
    extracted_entities: Optional[dict]

    # Fulfillment
    fulfillment_status: str
    fulfillment_score: float
    fulfillment_progress: float
    fulfillment_evidence: Optional[list]

    # Source
    source_url: Optional[str]
    source_type: Optional[str]

    # Related data
    metrics_count: int
    confirming_actions_count: int
    updates_count: int

    # Metadata
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PromiseListResponse(BaseModel):
    """Schema for paginated promise list"""

    promises: List[PromiseResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    filters: dict

    class Config:
        from_attributes = True


class PromiseStatistics(BaseModel):
    """Schema for promise statistics"""

    politician_id: int
    politician_name: str
    total_promises: int
    fulfilled: int
    partially_fulfilled: int
    delayed: int
    broken: int
    active: int
    fulfillment_rate: float
    average_fulfillment_score: float
    by_category: dict
    by_year: dict
    trending: str  # "improving", "stable", "declining"


class PromiseStatusUpdate(BaseModel):
    """Schema for updating promise status"""

    new_status: str
    update_reason: str
    supporting_evidence: Optional[list] = None
    updated_by: str = "system"


# ============================================================================
# Helper Functions
# ============================================================================


def calculate_fulfillment_rate(
    fulfilled: int,
    partially_fulfilled: int,
    delayed: int,
    active: int,
    broken: int,
) -> float:
    """Calculate overall fulfillment rate as percentage"""
    total = fulfilled + partially_fulfilled + delayed + broken
    if total == 0:
        return 0.0

    # Weight different outcomes
    # Fulfilled = 100%, Partial = 50%, Delayed = 30%, Broken = 0%
    score = (
        fulfilled * 100 + partially_fulfilled * 50 + delayed * 30 + broken * 0
    ) / total

    return round(score, 2)


def determine_trend(
    history: list,
    comparison_periods: int = 3,
) -> str:
    """Determine if promise fulfillment is improving, stable, or declining"""
    if len(history) < comparison_periods:
        return "stable"

    # Compare recent period to older period
    recent = history[-comparison_periods:]
    older = history[:comparison_periods]

    recent_avg = sum(h.get("fulfilled", 0) for h in recent) / len(recent)
    older_avg = sum(h.get("fulfilled", 0) for h in older) / len(older)

    if recent_avg > older_avg * 1.1:
        return "improving"
    elif recent_avg < older_avg * 0.9:
        return "declining"
    return "stable"


# ============================================================================
# API Endpoints
# ============================================================================


@router.get(
    "/",
    response_model=PromiseListResponse,
    summary="List all promises",
    description="Get a paginated list of promises with optional filtering and search",
    responses={
        200: {"description": "Successfully retrieved promise list"},
        400: {"description": "Invalid query parameters"},
    },
)
async def list_promises(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    politician_id: Optional[int] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    topic: Optional[str] = None,
    past_deadline: Optional[bool] = None,
    search: Optional[str] = None,
    sort_by: str = Query("promise_date", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order (asc/desc)"),
    db: Session = Depends(get_db),
):
    """
    List promises with filtering and pagination.

    ### Filters:
    - **politician_id**: Filter by politician ID
    - **status**: Filter by fulfillment status (active, fulfilled, partially_fulfilled, delayed, broken)
    - **category**: Filter by promise category
    - **topic**: Filter by topic tag
    - **past_deadline**: Filter by deadline status
    - **search**: Search across promise text and context

    ### Sorting:
    - **sort_by**: Field to sort by (default: promise_date)
    - **sort_order**: Sort direction (asc/desc, default: desc)
    """
    # Build query
    query = db.query(Promise)

    # Apply filters
    if politician_id:
        query = query.filter(Promise.politician_id == politician_id)

    if status:
        try:
            promise_status = PromiseStatus(status)
            query = query.filter(Promise.fulfillment_status == promise_status)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid promise status: {status}. Must be one of: {[e.value for e in PromiseStatus]}",
            )

    if category:
        query = query.filter(Promise.category == category)

    if topic:
        query = query.filter(Promise.topic_tags.contains([topic]))

    if past_deadline is not None:
        if past_deadline:
            query = query.filter(
                and_(
                    Promise.deadline.isnot(None),
                    Promise.deadline < datetime.utcnow(),
                )
            )
        else:
            query = query.filter(
                or_(
                    Promise.deadline.is_(None),
                    Promise.deadline >= datetime.utcnow(),
                )
            )

    if search:
        search_pattern = f"%{search}%"
        search_condition = or_(
            Promise.promise_text.ilike(search_pattern),
            Promise.full_context.ilike(search_pattern),
            Promise.context_before.ilike(search_pattern),
            Promise.context_after.ilike(search_pattern),
        )
        query = query.filter(search_condition)

    # Get total count
    total = query.count()

    # Apply sorting
    valid_sort_fields = [
        "promise_date",
        "deadline",
        "fulfillment_score",
        "fulfillment_status",
        "created_at",
    ]
    if sort_by not in valid_sort_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sort field. Must be one of: {', '.join(valid_sort_fields)}",
        )

    sort_column = getattr(Promise, sort_by)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    # Apply pagination
    offset = (page - 1) * page_size
    promises = query.offset(offset).limit(page_size).all()

    # Join with politician for name
    promises_with_politician = (
        db.query(Promise, Politician)
        .join(Politician, Promise.politician_id == Politician.id)
        .filter(Promise.id.in_([p.id for p in promises]))
        .all()
    )

    # Calculate total pages
    total_pages = (total + page_size - 1) // page_size

    return PromiseListResponse(
        promises=[
            PromiseResponse(
                id=p.id,
                politician_id=p.politician_id,
                politician_name=pol.full_name or f"{pol.first_name} {pol.last_name}",
                promise_text=p.promise_text,
                promise_date=p.promise_date,
                fulfillment_status=p.fulfillment_status.value
                if hasattr(p.fulfillment_status, "value")
                else p.fulfillment_status,
                fulfillment_score=p.fulfillment_score,
                deadline=p.deadline,
                category=p.category,
                topic_tags=p.topic_tags,
                is_past_deadline=p.is_past_deadline,
            )
            for p, pol in promises_with_politician
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        filters={
            "politician_id": politician_id,
            "status": status,
            "category": category,
            "topic": topic,
            "past_deadline": past_deadline,
            "search": search,
        },
    )


@router.get(
    "/{promise_id}",
    response_model=PromiseDetailResponse,
    summary="Get promise by ID",
    description="Retrieve detailed information about a specific promise",
    responses={
        200: {"description": "Successfully retrieved promise details"},
        404: {"description": "Promise not found"},
    },
)
async def get_promise(
    promise_id: int,
    db: Session = Depends(get_db),
):
    """
    Get detailed information about a specific promise.

    Includes:
    - Full promise content and context
    - AI analysis (confidence, sentiment, entities)
    - Fulfillment tracking (status, score, progress)
    - Related metrics and confirming actions
    - Source attribution
    """
    # Fetch promise with joins
    promise_politician = (
        db.query(Promise, Politician)
        .join(Politician, Promise.politician_id == Politician.id)
        .filter(Promise.id == promise_id)
        .first()
    )

    if not promise_politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Promise with ID {promise_id} not found",
        )

    promise, politician = promise_politician

    # Get counts
    metrics_count = (
        db.query(PromiseMetric).filter(PromiseMetric.promise_id == promise_id).count()
    )
    confirming_actions_count = (
        db.query(Action)
        .filter(Action.id.in_(promise.fulfillment_evidence or []))
        .count()
        if promise.fulfillment_evidence
        else 0
    )
    updates_count = (
        db.query(PromiseUpdate).filter(PromiseUpdate.promise_id == promise_id).count()
    )

    # Calculate days until deadline
    days_until_deadline = None
    if promise.deadline:
        delta = promise.deadline - datetime.utcnow()
        days_until_deadline = delta.days

    return PromiseDetailResponse(
        id=promise.id,
        politician_id=promise.politician_id,
        politician_name=politician.full_name
        or f"{politician.first_name} {politician.last_name}",
        office_title=politician.office_title,
        party=politician.party,
        promise_text=promise.promise_text,
        promise_type=promise.promise_type,
        category=promise.category,
        topic_tags=promise.topic_tags,
        context_before=promise.context_before,
        context_after=promise.context_after,
        full_context=promise.full_context,
        promise_date=promise.promise_date,
        deadline=promise.deadline,
        is_immediate=promise.is_immediate,
        timeframe_text=promise.timeframe_text,
        is_past_deadline=promise.is_past_deadline,
        days_until_deadline=days_until_deadline,
        claim_id=promise.claim_id,
        confidence_score=promise.confidence_score,
        sentiment_score=promise.sentiment_score,
        extracted_entities=promise.extracted_entities,
        fulfillment_status=promise.fulfillment_status.value
        if hasattr(promise.fulfillment_status, "value")
        else promise.fulfillment_status,
        fulfillment_score=promise.fulfillment_score,
        fulfillment_progress=promise.fulfillment_progress,
        fulfillment_evidence=promise.fulfillment_evidence,
        source_url=promise.source_url,
        source_type=promise.source_type,
        metrics_count=metrics_count,
        confirming_actions_count=confirming_actions_count,
        updates_count=updates_count,
        created_at=promise.created_at,
        updated_at=promise.updated_at,
    )


@router.post(
    "/",
    response_model=PromiseDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new promise",
    description="Add a new campaign promise to the database",
    responses={
        201: {"description": "Promise created successfully"},
        400: {"description": "Validation error"},
    },
)
async def create_promise(
    promise_data: PromiseCreate,
    db: Session = Depends(get_db),
):
    """
    Create a new promise.

    This endpoint is typically used by:
    - AI claim detection pipeline
    - Data import scripts
    - Administrators (manual entry)

    Requires proper authentication in production.
    """
    # Verify politician exists
    politician = (
        db.query(Politician).filter(Politician.id == promise_data.politician_id).first()
    )

    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician with ID {promise_data.politician_id} not found",
        )

    # Create promise object
    promise = Promise(
        politician_id=promise_data.politician_id,
        promise_text=promise_data.promise_text,
        promise_type=promise_data.promise_type,
        category=promise_data.category,
        topic_tags=promise_data.topic_tags or [],
        context_before=promise_data.context_before,
        context_after=promise_data.context_after,
        full_context=promise_data.full_context,
        promise_date=datetime.utcnow(),  # Or use provided date if available
        deadline=promise_data.deadline,
        is_immediate=promise_data.is_immediate,
        timeframe_text=promise_data.timeframe_text,
        claim_id=promise_data.claim_id,
        confidence_score=promise_data.confidence_score,
        sentiment_score=promise_data.sentiment_score,
        fulfillment_status=PromiseStatus.ACTIVE,
        fulfillment_score=0.0,
        fulfillment_progress=0.0,
        source_url=promise_data.source_url,
        source_type=promise_data.source_type,
    )

    db.add(promise)
    db.commit()
    db.refresh(promise)

    # Return created promise with details
    return await get_promise(promise.id, db)


@router.put(
    "/{promise_id}",
    response_model=PromiseDetailResponse,
    summary="Update promise",
    description="Update an existing promise's information",
    responses={
        200: {"description": "Promise updated successfully"},
        404: {"description": "Promise not found"},
        400: {"description": "Validation error"},
    },
)
async def update_promise(
    promise_id: int,
    promise_data: PromiseUpdate,
    db: Session = Depends(get_db),
):
    """
    Update a promise's information.

    Only provided fields will be updated. Other fields remain unchanged.
    """
    promise = db.query(Promise).filter(Promise.id == promise_id).first()

    if not promise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Promise with ID {promise_id} not found",
        )

    # Update fields if provided
    update_data = promise_data.dict(exclude_unset=True)

    # Handle fulfillment status conversion
    if "fulfillment_status" in update_data:
        try:
            update_data["fulfillment_status"] = PromiseStatus(
                update_data["fulfillment_status"]
            )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid fulfillment status: {promise_data.fulfillment_status}",
            )

    for key, value in update_data.items():
        if value is not None:
            setattr(promise, key, value)

    db.commit()
    db.refresh(promise)

    return await get_promise(promise_id, db)


@router.delete(
    "/{promise_id}",
    summary="Delete promise",
    description="Remove a promise from the database",
    responses={
        200: {"description": "Promise deleted successfully"},
        404: {"description": "Promise not found"},
    },
)
async def delete_promise(
    promise_id: int,
    db: Session = Depends(get_db),
):
    """
    Delete a promise.

    ⚠️ WARNING: This is a hard delete and will remove all associated data.
    In production, consider implementing soft deletes instead.
    """
    promise = db.query(Promise).filter(Promise.id == promise_id).first()

    if not promise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Promise with ID {promise_id} not found",
        )

    db.delete(promise)
    db.commit()

    return {
        "message": f"Promise {promise_id} deleted successfully",
        "politician_id": promise.politician_id,
    }


@router.post(
    "/{promise_id}/update-status",
    response_model=PromiseDetailResponse,
    summary="Update promise status",
    description="Update promise fulfillment status with reason and evidence",
    responses={
        200: {"description": "Promise status updated successfully"},
        404: {"description": "Promise not found"},
        400: {"description": "Invalid status value"},
    },
)
async def update_promise_status(
    promise_id: int,
    status_update: PromiseStatusUpdate,
    db: Session = Depends(get_db),
):
    """
    Update a promise's fulfillment status with detailed tracking.

    This creates a historical record in PromiseUpdate table for audit trail.
    """
    promise = db.query(Promise).filter(Promise.id == promise_id).first()

    if not promise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Promise with ID {promise_id} not found",
        )

    # Convert status string to enum
    try:
        new_status = PromiseStatus(status_update.new_status)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status: {status_update.new_status}. Must be one of: {[e.value for e in PromiseStatus]}",
        )

    # Save old status for history
    old_status = promise.fulfillment_status
    old_score = promise.fulfillment_score

    # Update promise
    promise.fulfillment_status = new_status
    promise.updated_at = datetime.utcnow()

    # Create history record
    update_record = PromiseUpdate(
        promise_id=promise_id,
        old_status=old_status,
        new_status=new_status,
        old_score=old_score,
        new_score=promise.fulfillment_score,
        update_reason=status_update.update_reason,
        supporting_evidence=status_update.supporting_evidence,
        updated_by=status_update.updated_by,
    )

    db.add(update_record)
    db.commit()
    db.refresh(promise)

    return await get_promise(promise_id, db)


@router.post(
    "/{promise_id}/metrics",
    summary="Add metric to promise",
    description="Add a success metric for evaluating promise fulfillment",
    responses={
        201: {"description": "Metric created successfully"},
        404: {"description": "Promise not found"},
    },
)
async def add_promise_metric(
    promise_id: int,
    metric_data: PromiseMetricCreate,
    db: Session = Depends(get_db),
):
    """
    Add a success metric to a promise.

    Metrics define how promise fulfillment will be measured (quantitative or qualitative).
    """
    promise = db.query(Promise).filter(Promise.id == promise_id).first()

    if not promise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Promise with ID {promise_id} not found",
        )

    metric = PromiseMetric(
        promise_id=promise_id,
        metric_type=metric_data.metric_type,
        target_value=metric_data.target_value,
        current_value=metric_data.current_value,
        unit=metric_data.unit,
        threshold=metric_data.threshold,
        evaluation_criteria=metric_data.evaluation_criteria,
    )

    db.add(metric)
    db.commit()
    db.refresh(metric)

    return {
        "metric": {
            "id": metric.id,
            "promise_id": metric.promise_id,
            "metric_type": metric.metric_type,
            "target_value": metric.target_value,
            "current_value": metric.current_value,
            "unit": metric.unit,
            "threshold": metric.threshold,
            "evaluation_criteria": metric.evaluation_criteria,
        },
        "message": "Metric created successfully",
    }


@router.get(
    "/{promise_id}/history",
    summary="Get promise update history",
    description="Retrieve the history of status updates for a promise",
    responses={
        200: {"description": "Successfully retrieved update history"},
        404: {"description": "Promise not found"},
    },
)
async def get_promise_history(
    promise_id: int,
    limit: int = Query(50, ge=1, le=200, description="Maximum records to return"),
    db: Session = Depends(get_db),
):
    """Get the chronological history of promise status updates"""
    promise = db.query(Promise).filter(Promise.id == promise_id).first()

    if not promise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Promise with ID {promise_id} not found",
        )

    # Get update history
    updates = (
        db.query(PromiseUpdate)
        .filter(PromiseUpdate.promise_id == promise_id)
        .order_by(PromiseUpdate.updated_at.desc())
        .limit(limit)
        .all()
    )

    return {
        "promise_id": promise_id,
        "current_status": promise.fulfillment_status.value
        if hasattr(promise.fulfillment_status, "value")
        else promise.fulfillment_status,
        "current_score": promise.fulfillment_score,
        "history": [
            {
                "update_id": u.id,
                "old_status": u.old_status.value if u.old_status else None,
                "new_status": u.new_status.value if u.new_status else None,
                "old_score": u.old_score,
                "new_score": u.new_score,
                "reason": u.update_reason,
                "evidence": u.supporting_evidence,
                "updated_by": u.updated_by,
                "updated_at": u.updated_at,
            }
            for u in updates
        ],
    }


@router.get(
    "/statistics/politician/{politician_id}",
    response_model=PromiseStatistics,
    summary="Get promise statistics for politician",
    description="Retrieve comprehensive promise fulfillment statistics for a politician",
    responses={
        200: {"description": "Successfully retrieved statistics"},
        404: {"description": "Politician not found"},
    },
)
async def get_politician_promise_statistics(
    politician_id: int,
    db: Session = Depends(get_db),
):
    """
    Get comprehensive statistics about a politician's promises.

    Includes breakdowns by status, category, and year.
    """
    politician = db.query(Politician).filter(Politician.id == politician_id).first()

    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician with ID {politician_id} not found",
        )

    # Get all promises for politician
    promises = db.query(Promise).filter(Promise.politician_id == politician_id).all()

    # Count by status
    status_counts = {
        "fulfilled": 0,
        "partially_fulfilled": 0,
        "delayed": 0,
        "broken": 0,
        "active": 0,
    }

    for promise in promises:
        status = (
            promise.fulfillment_status.value
            if hasattr(promise.fulfillment_status, "value")
            else str(promise.fulfillment_status)
        )
        if status in status_counts:
            status_counts[status] += 1

    # Calculate fulfillment rate
    fulfillment_rate = calculate_fulfillment_rate(
        status_counts["fulfilled"],
        status_counts["partially_fulfilled"],
        status_counts["delayed"],
        status_counts["active"],
        status_counts["broken"],
    )

    # Calculate average fulfillment score
    scores = [p.fulfillment_score for p in promises if p.fulfillment_score is not None]
    avg_score = round(sum(scores) / len(scores), 2) if scores else 0.0

    # Breakdown by category
    by_category = {}
    for promise in promises:
        if promise.category:
            if promise.category not in by_category:
                by_category[promise.category] = {
                    "total": 0,
                    "fulfilled": 0,
                    "avg_score": 0,
                }
            by_category[promise.category]["total"] += 1
            status = (
                promise.fulfillment_status.value
                if hasattr(promise.fulfillment_status, "value")
                else str(promise.fulfillment_status)
            )
            if status == "fulfilled":
                by_category[promise.category]["fulfilled"] += 1

    # Calculate averages for categories
    for category, data in by_category.items():
        cat_promises = [
            p
            for p in promises
            if p.category == category and p.fulfillment_score is not None
        ]
        if cat_promises:
            data["avg_score"] = round(
                sum(p.fulfillment_score for p in cat_promises) / len(cat_promises), 2
            )

    # Breakdown by year (simplified)
    by_year = {}
    for promise in promises:
        year = promise.promise_date.year
        if year not in by_year:
            by_year[year] = {"total": 0, "fulfilled": 0}
        by_year[year]["total"] += 1
        status = (
            promise.fulfillment_status.value
            if hasattr(promise.fulfillment_status, "value")
            else str(promise.fulfillment_status)
        )
        if status == "fulfilled":
            by_year[year]["fulfilled"] += 1

    # Determine trend
    trending = determine_trend(list(by_year.values()))

    politician_name = (
        politician.full_name or f"{politician.first_name} {politician.last_name}"
    )

    return PromiseStatistics(
        politician_id=politician_id,
        politician_name=politician_name,
        total_promises=len(promises),
        fulfilled=status_counts["fulfilled"],
        partially_fulfilled=status_counts["partially_fulfilled"],
        delayed=status_counts["delayed"],
        broken=status_counts["broken"],
        active=status_counts["active"],
        fulfillment_rate=fulfillment_rate,
        average_fulfillment_score=avg_score,
        by_category=by_category,
        by_year=by_year,
        trending=trending,
    )


@router.get(
    "/leaderboard",
    summary="Get promise fulfillment leaderboard",
    description="Rank politicians by promise fulfillment rate",
    responses={
        200: {"description": "Successfully retrieved leaderboard"},
    },
)
async def get_promise_leaderboard(
    limit: int = Query(
        100, ge=1, le=500, description="Number of politicians to return"
    ),
    jurisdiction_level: Optional[str] = Query(
        None, description="Filter by jurisdiction"
    ),
    office_type: Optional[str] = Query(None, description="Filter by office type"),
    peer_group: Optional[str] = Query(None, description="Filter by peer group"),
    db: Session = Depends(get_db),
):
    """
    Get a ranked leaderboard of politicians by promise fulfillment rate.

    Great for transparency reporting and public accountability.
    """
    # Build base query
    query = db.query(Politician)

    if jurisdiction_level:
        query = query.filter(Politician.jurisdiction_level == jurisdiction_level)

    if office_type:
        query = query.filter(Politician.office_type == office_type)

    if peer_group:
        query = query.filter(Politician.party.ilike(f"%{peer_group}%"))

    # Get politicians
    politicians = query.all()

    # Calculate stats for each
    leaderboard = []
    for politician in politicians[:limit]:
        promises = (
            db.query(Promise).filter(Promise.politician_id == politician.id).all()
        )

        if not promises:
            continue

        status_counts = {
            "fulfilled": 0,
            "partially_fulfilled": 0,
            "delayed": 0,
            "broken": 0,
            "active": 0,
        }

        for promise in promises:
            status = (
                promise.fulfillment_status.value
                if hasattr(promise.fulfillment_status, "value")
                else str(promise.fulfillment_status)
            )
            if status in status_counts:
                status_counts[status] += 1

        fulfillment_rate = calculate_fulfillment_rate(
            status_counts["fulfilled"],
            status_counts["partially_fulfilled"],
            status_counts["delayed"],
            status_counts["active"],
            status_counts["broken"],
        )

        politician_name = (
            politician.full_name or f"{politician.first_name} {politician.last_name}"
        )

        leaderboard.append(
            {
                "rank": None,  # Will be set after sorting
                "politician_id": politician.id,
                "politician_name": politician_name,
                "office_title": politician.office_title,
                "party": politician.party,
                "total_promises": len(promises),
                "fulfillment_rate": fulfillment_rate,
                "fulfilled": status_counts["fulfilled"],
                "broken": status_counts["broken"],
            }
        )

    # Sort by fulfillment rate (descending)
    leaderboard.sort(key=lambda x: x["fulfillment_rate"], reverse=True)

    # Assign ranks
    for i, entry in enumerate(leaderboard):
        entry["rank"] = i + 1

    return {
        "leaderboard": leaderboard,
        "total_count": len(leaderboard),
        "filters": {
            "jurisdiction_level": jurisdiction_level,
            "office_type": office_type,
            "peer_group": peer_group,
        },
    }

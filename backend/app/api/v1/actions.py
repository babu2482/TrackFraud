"""
Actions API Endpoints for The Glass House

This module provides RESTful endpoints for managing and querying government actions
taken by politicians across all levels of government (federal, state, local).

Endpoints include:
- List actions with filtering, pagination, and search
- Get individual action details with evidence and related data
- Create, update, and delete actions
- Get actions by politician, topic, or date range
- Analyze action patterns and impact

All endpoints use proper validation, error handling, and async where appropriate.
"""

from datetime import datetime
from typing import List, Optional

from app.core.config import get_settings
from app.db.database import get_db
from app.db.models import (
    Action,
    ActionCategory,
    ActionType,
    Evidence,
    Politician,
    Topic,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload

router = APIRouter()

settings = get_settings()


# ==================================================================================
# Pydantic Schemas
# ==================================================================================

from pydantic import BaseModel, Field


class ActionBase(BaseModel):
    """Base action schema"""

    action_type: str
    action_category: str
    title: str = Field(..., max_length=500)
    description: Optional[str] = None
    action_date: datetime
    status: Optional[str] = None
    source_url: Optional[str] = Field(None, max_length=500)
    source_id: Optional[str] = Field(None, max_length=100)


class ActionCreate(ActionBase):
    """Schema for creating a new action"""

    politician_id: int
    impact_level: Optional[int] = Field(2, ge=1, le=5)
    outcome: Optional[str] = None
    full_text: Optional[str] = None
    topic_ids: Optional[List[int]] = Field(default_factory=list)


class ActionUpdate(BaseModel):
    """Schema for updating an action"""

    title: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = None
    status: Optional[str] = None
    impact_level: Optional[int] = Field(None, ge=1, le=5)
    outcome: Optional[str] = None
    source_url: Optional[str] = Field(None, max_length=500)
    full_text: Optional[str] = None


class ActionResponse(BaseModel):
    """Schema for action list items"""

    id: int
    politician_id: int
    politician_name: str
    action_type: str
    action_category: str
    title: str
    action_date: datetime
    status: Optional[str]
    impact_level: int

    class Config:
        from_attributes = True


class ActionDetailResponse(BaseModel):
    """Schema for full action details"""

    id: int
    politician_id: int
    politician: dict  # Nested politician data
    action_type: str
    action_category: str
    title: str
    description: Optional[str]
    action_date: datetime
    effective_date: Optional[datetime]
    status: Optional[str]
    impact_level: int
    outcome: Optional[str]
    source_url: Optional[str]
    source_id: Optional[str]
    evidence_tier: str
    full_text: Optional[str]
    topics: List[dict]
    evidence: List[dict]
    ai_summary: Optional[str]
    ai_sentiment_score: Optional[float]
    ai_confidence: Optional[float]
    metadata: Optional[dict]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ActionListResponse(BaseModel):
    """Schema for paginated action list"""

    actions: List[ActionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

    class Config:
        from_attributes = True


class EvidenceResponse(BaseModel):
    """Schema for evidence item"""

    id: int
    source_type: str
    source_url: str
    source_reliability: str
    source_name: Optional[str]
    verification_status: str
    verified_at: Optional[datetime]

    class Config:
        from_attributes = True


class ActionStats(BaseModel):
    """Statistics about actions"""

    total_actions: int
    actions_by_type: dict
    actions_by_category: dict
    actions_by_month: dict
    avg_impact_level: float
    top_politicians: List[dict]


# ==================================================================================
# API Endpoints
# ==================================================================================


@router.get(
    "/",
    response_model=ActionListResponse,
    summary="List all actions",
    description="Get a paginated list of government actions with filtering and search",
    responses={
        200: {"description": "Successfully retrieved action list"},
        400: {"description": "Invalid query parameters"},
    },
)
async def list_actions(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    politician_id: Optional[int] = None,
    action_type: Optional[str] = None,
    action_category: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    status: Optional[str] = None,
    min_impact: Optional[int] = Query(None, ge=1, le=5),
    search: Optional[str] = None,
    sort_by: str = Query("action_date", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order (asc/desc)"),
    db: Session = Depends(get_db),
):
    """
    List government actions with filtering and pagination.

    ### Filters:
    - **politician_id**: Filter by politician ID
    - **action_type**: Filter by action type (vote, executive_order, speech, etc.)
    - **action_category**: Filter by category (executive, legislative, judicial)
    - **start_date**: Filter actions on or after this date
    - **end_date**: Filter actions on or before this date
    - **status**: Filter by status (passed, failed, enacted, vetoed, etc.)
    - **min_impact**: Filter by minimum impact level (1-5)
    - **search**: Search across title and description

    ### Sorting:
    - **sort_by**: Field to sort by (default: action_date)
    - **sort_order**: Sort direction (asc/desc, default: desc)
    """
    # Build query
    query = (
        db.query(Action)
        .join(Politician, Action.politician_id == Politician.id)
        .options(joinedload(Action.topics))
    )
    count_query = db.query(func.count(Action.id)).join(
        Politician, Action.politician_id == Politician.id
    )

    # Apply filters
    if politician_id:
        query = query.filter(Action.politician_id == politician_id)
        count_query = count_query.filter(Action.politician_id == politician_id)

    if action_type:
        query = query.filter(Action.action_type == action_type)
        count_query = count_query.filter(Action.action_type == action_type)

    if action_category:
        query = query.filter(Action.action_category == action_category)
        count_query = count_query.filter(Action.action_category == action_category)

    if start_date:
        query = query.filter(Action.action_date >= start_date)
        count_query = count_query.filter(Action.action_date >= start_date)

    if end_date:
        query = query.filter(Action.action_date <= end_date)
        count_query = count_query.filter(Action.action_date <= end_date)

    if status:
        query = query.filter(Action.status.ilike(f"%{status}%"))
        count_query = count_query.filter(Action.status.ilike(f"%{status}%"))

    if min_impact:
        query = query.filter(Action.impact_level >= min_impact)
        count_query = count_query.filter(Action.impact_level >= min_impact)

    if search:
        search_pattern = f"%{search}%"
        search_condition = or_(
            Action.title.ilike(search_pattern),
            Action.description.ilike(search_pattern),
        )
        query = query.filter(search_condition)
        count_query = count_query.filter(search_condition)

    # Get total count
    total = count_query.scalar()

    # Apply sorting
    valid_sort_fields = ["action_date", "title", "impact_level", "created_at"]
    if sort_by not in valid_sort_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sort field. Must be one of: {', '.join(valid_sort_fields)}",
        )

    sort_column = getattr(Action, sort_by)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    # Apply pagination
    offset = (page - 1) * page_size
    actions = query.offset(offset).limit(page_size).all()

    # Calculate total pages
    total_pages = (total + page_size - 1) // page_size

    # Format response
    return ActionListResponse(
        actions=[
            ActionResponse(
                id=a.id,
                politician_id=a.politician_id,
                politician_name=a.politician.full_name
                or f"{a.politician.first_name} {a.politician.last_name}",
                action_type=a.action_type.value
                if hasattr(a.action_type, "value")
                else a.action_type,
                action_category=a.action_category.value
                if hasattr(a.action_category, "value")
                else a.action_category,
                title=a.title,
                action_date=a.action_date,
                status=a.status,
                impact_level=a.impact_level,
            )
            for a in actions
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get(
    "/{action_id}",
    response_model=ActionDetailResponse,
    summary="Get action by ID",
    description="Retrieve detailed information about a specific action",
    responses={
        200: {"description": "Successfully retrieved action details"},
        404: {"description": "Action not found"},
    },
)
async def get_action(
    action_id: int,
    db: Session = Depends(get_db),
):
    """
    Get detailed information about a specific government action.

    Includes:
    - Full action details and metadata
    - Politician information
    - Associated topics
    - Evidence and source verification
    - AI analysis (summary, sentiment, confidence)
    """
    # Fetch action with relationships
    action = (
        db.query(Action)
        .options(
            joinedload(Action.politician),
            joinedload(Action.topics),
            joinedload(Action.related_promises),
        )
        .filter(Action.id == action_id)
        .first()
    )

    if not action:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action with ID {action_id} not found",
        )

    # Get evidence
    evidence = db.query(Evidence).filter(Evidence.action_id == action_id).all()

    # Format response
    return ActionDetailResponse(
        id=action.id,
        politician_id=action.politician_id,
        politician={
            "id": action.politician.id,
            "name": action.politician.full_name,
            "office": action.politician.office_title,
            "party": action.politician.party,
        },
        action_type=action.action_type.value
        if hasattr(action.action_type, "value")
        else action.action_type,
        action_category=action.action_category.value
        if hasattr(action.action_category, "value")
        else action.action_category,
        title=action.title,
        description=action.description,
        action_date=action.action_date,
        effective_date=action.effective_date,
        status=action.status,
        impact_level=action.impact_level,
        outcome=action.outcome,
        source_url=action.source_url,
        source_id=action.source_id,
        evidence_tier=action.evidence_tier.value
        if hasattr(action.evidence_tier, "value")
        else action.evidence_tier,
        full_text=action.full_text,
        topics=[
            {"id": t.id, "name": t.name, "category": t.category} for t in action.topics
        ],
        evidence=[
            {
                "id": e.id,
                "source_type": e.source_type,
                "source_url": e.source_url,
                "source_reliability": e.source_reliability,
                "verification_status": e.verification_status,
            }
            for e in evidence
        ],
        ai_summary=action.ai_summary,
        ai_sentiment_score=action.ai_sentiment_score,
        ai_confidence=action.ai_confidence,
        metadata=action.metadata,
        created_at=action.created_at,
        updated_at=action.updated_at,
    )


@router.post(
    "/",
    response_model=ActionDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new action",
    description="Add a new government action to the database",
    responses={
        201: {"description": "Action created successfully"},
        400: {"description": "Validation error"},
        404: {"description": "Politician not found"},
    },
)
async def create_action(
    action_data: ActionCreate,
    db: Session = Depends(get_db),
):
    """
    Create a new government action record.

    This endpoint is typically used during data import or by administrators.
    Requires proper authentication in production.
    """
    # Verify politician exists
    politician = (
        db.query(Politician).filter(Politician.id == action_data.politician_id).first()
    )
    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician with ID {action_data.politician_id} not found",
        )

    # Validate action type and category
    try:
        action_type = ActionType(action_data.action_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid action_type: {action_data.action_type}",
        )

    try:
        action_category = ActionCategory(action_data.action_category)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid action_category: {action_data.action_category}",
        )

    # Create action object
    action = Action(
        politician_id=action_data.politician_id,
        action_type=action_type,
        action_category=action_category,
        title=action_data.title,
        description=action_data.description,
        action_date=action_data.action_date,
        status=action_data.status,
        impact_level=action_data.impact_level,
        outcome=action_data.outcome,
        source_url=action_data.source_url,
        source_id=action_data.source_id,
        full_text=action_data.full_text,
    )

    db.add(action)
    db.commit()
    db.refresh(action)

    # Link topics if provided
    if action_data.topic_ids:
        topics = db.query(Topic).filter(Topic.id.in_(action_data.topic_ids)).all()
        if len(topics) != len(action_data.topic_ids):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="One or more topic IDs not found",
            )
        action.topics = topics
        db.commit()

    # Return created action with details
    return await get_action(action.id, db)


@router.put(
    "/{action_id}",
    response_model=ActionDetailResponse,
    summary="Update action",
    description="Update an existing action's information",
    responses={
        200: {"description": "Action updated successfully"},
        404: {"description": "Action not found"},
        400: {"description": "Validation error"},
    },
)
async def update_action(
    action_id: int,
    action_data: ActionUpdate,
    db: Session = Depends(get_db),
):
    """
    Update an action's information.

    Only provided fields will be updated. Other fields remain unchanged.
    """
    action = db.query(Action).filter(Action.id == action_id).first()

    if not action:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action with ID {action_id} not found",
        )

    # Update fields if provided
    update_data = action_data.dict(exclude_unset=True)

    for key, value in update_data.items():
        if value is not None:
            setattr(action, key, value)

    db.commit()
    db.refresh(action)

    return await get_action(action_id, db)


@router.delete(
    "/{action_id}",
    summary="Delete action",
    description="Remove an action from the database",
    responses={
        200: {"description": "Action deleted successfully"},
        404: {"description": "Action not found"},
    },
)
async def delete_action(
    action_id: int,
    db: Session = Depends(get_db),
):
    """
    Delete an action.

    ⚠️ WARNING: This will also delete associated evidence records.
    """
    action = db.query(Action).filter(Action.id == action_id).first()

    if not action:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action with ID {action_id} not found",
        )

    # Delete associated evidence first
    db.query(Evidence).filter(Evidence.action_id == action_id).delete()

    # Delete the action
    db.delete(action)
    db.commit()

    return {"message": f"Action {action_id} deleted successfully"}


@router.get(
    "/{action_id}/evidence",
    response_model=List[EvidenceResponse],
    summary="Get action evidence",
    description="Retrieve all evidence sources for an action",
)
async def get_action_evidence(
    action_id: int,
    db: Session = Depends(get_db),
):
    """Get all evidence sources for a specific action"""
    action = db.query(Action).filter(Action.id == action_id).first()

    if not action:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action with ID {action_id} not found",
        )

    evidence = db.query(Evidence).filter(Evidence.action_id == action_id).all()

    return [
        EvidenceResponse(
            id=e.id,
            source_type=e.source_type,
            source_url=e.source_url,
            source_reliability=e.source_reliability,
            source_name=e.source_name,
            verification_status=e.verification_status,
            verified_at=e.verified_at,
        )
        for e in evidence
    ]


@router.get(
    "/stats",
    response_model=ActionStats,
    summary="Get action statistics",
    description="Retrieve aggregated statistics about government actions",
)
async def get_action_stats(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
):
    """
    Get statistics about government actions.

    Returns:
    - Total action count
    - Breakdown by type and category
    - Monthly distribution
    - Average impact level
    - Top politicians by action count
    """
    # Build base query
    query = db.query(Action)

    if start_date:
        query = query.filter(Action.action_date >= start_date)
    if end_date:
        query = query.filter(Action.action_date <= end_date)

    # Total actions
    total_actions = query.count()

    # Actions by type
    actions_by_type = (
        db.query(Action.action_type, func.count(Action.id))
        .group_by(Action.action_type)
        .all()
    )
    actions_by_type_dict = {
        str(at.value if hasattr(at, "value") else at): count
        for at, count in actions_by_type
    }

    # Actions by category
    actions_by_category = (
        db.query(Action.action_category, func.count(Action.id))
        .group_by(Action.action_category)
        .all()
    )
    actions_by_category_dict = {
        str(ac.value if hasattr(ac, "value") else ac): count
        for ac, count in actions_by_category
    }

    # Actions by month
    actions_by_month = (
        db.query(
            func.strftime("%Y-%m", Action.action_date).label("month"),
            func.count(Action.id).label("count"),
        )
        .group_by("month")
        .order_by("month")
        .all()
    )
    actions_by_month_dict = {month: count for month, count in actions_by_month}

    # Average impact level
    avg_impact = db.query(func.avg(Action.impact_level)).scalar() or 0.0

    # Top politicians by action count
    top_politicians = (
        db.query(
            Politician.id,
            Politician.full_name,
            Politician.office_title,
            func.count(Action.id).label("action_count"),
        )
        .join(Action, Politician.id == Action.politician_id)
        .group_by(Politician.id)
        .order_by("action_count.desc()")
        .limit(10)
        .all()
    )
    top_politicians_list = [
        {
            "id": p.id,
            "name": p.full_name,
            "office": p.office_title,
            "action_count": p.action_count,
        }
        for p in top_politicians
    ]

    return ActionStats(
        total_actions=total_actions,
        actions_by_type=actions_by_type_dict,
        actions_by_category=actions_by_category_dict,
        actions_by_month=actions_by_month_dict,
        avg_impact_level=round(avg_impact, 2),
        top_politicians=top_politicians_list,
    )

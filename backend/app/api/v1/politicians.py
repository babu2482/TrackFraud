"""
Politicians API Endpoints for The Glass House

This module provides RESTful endpoints for managing and querying politician data
across all levels of government (federal, state, local).

Endpoints include:
- List politicians with filtering, pagination, and search
- Get individual politician details
- Get politician actions and voting records
- Get related bills and promises
- Calculate and retrieve transparency scores

All endpoints use proper validation, error handling, and async where appropriate.
"""

from typing import List, Optional

from app.core.config import get_settings
from app.db.database import get_db
from app.db.models import (
    Action,
    Bill,
    JurisdictionLevel,
    OfficeType,
    Politician,
    Promise,
    PromiseStatus,
    TransparencyScore,
    Vote,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

# Import Pydantic schemas (to be created)
# from app.db.schemas import (
#     PoliticianCreate,
#     PoliticianUpdate,
#     PoliticianResponse,
#     PoliticianDetailResponse,
#     PoliticianStats,
#     PoliticianListResponse,
# )

router = APIRouter()

settings = get_settings()


# ============================================================================
# Pydantic Schemas (Inline for now, will move to schemas.py later)
# ============================================================================

from datetime import datetime
from typing import Optional as PyOptional

from pydantic import BaseModel, Field


class PoliticianBase(BaseModel):
    """Base politician schema"""

    first_name: str
    last_name: str
    middle_name: Optional[str] = None
    office_title: str
    office_type: str
    jurisdiction_level: str
    party: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    term_start: datetime
    term_end: Optional[datetime] = None


class PoliticianCreate(PoliticianBase):
    """Schema for creating a new politician"""

    bio: Optional[str] = None
    website_url: Optional[str] = None


class PoliticianUpdate(BaseModel):
    """Schema for updating a politician"""

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    party: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    term_end: Optional[datetime] = None
    bio: Optional[str] = None
    website_url: Optional[str] = None
    is_current: Optional[bool] = None


class PoliticianResponse(BaseModel):
    """Schema for politician list items"""

    id: int
    full_name: str
    office_title: str
    party: Optional[str]
    state: Optional[str]
    is_current: bool
    term_start: datetime

    class Config:
        from_attributes = True


class PoliticianDetailResponse(BaseModel):
    """Schema for full politician details"""

    id: int
    first_name: str
    last_name: str
    middle_name: Optional[str]
    full_name: str
    office_title: str
    office_type: str
    jurisdiction_level: str
    party: Optional[str]
    state: Optional[str]
    district: Optional[str]
    term_start: datetime
    term_end: Optional[datetime]
    is_current: bool
    bio: Optional[str]
    website_url: Optional[str]
    social_media: Optional[dict]
    years_in_office: int
    action_count: int
    vote_count: int
    promise_count: int
    latest_transparency_score: Optional[float]
    transparency_rank: Optional[int]

    class Config:
        from_attributes = True


class PoliticianListResponse(BaseModel):
    """Schema for paginated politician list"""

    politicians: List[PoliticianResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

    class Config:
        from_attributes = True


# ============================================================================
# Query Parameter Models
# ============================================================================


class PoliticianFilter(BaseModel):
    """Filter parameters for politician queries"""

    office_type: Optional[str] = None
    jurisdiction_level: Optional[str] = None
    party: Optional[str] = None
    state: Optional[str] = None
    is_current: Optional[bool] = None
    search: Optional[str] = None


# ============================================================================
# Helper Functions
# ============================================================================


def build_politician_query(
    db: Session,
    filters: PoliticianFilter,
) -> tuple:
    """
    Build a SQLAlchemy query for politicians with filters.

    Returns:
        tuple: (query, total_count)
    """
    query = db.query(Politician)
    count_query = db.query(func.count(Politician.id))

    # Apply filters
    if filters.office_type:
        query = query.filter(Politician.office_type == filters.office_type)
        count_query = count_query.filter(Politician.office_type == filters.office_type)

    if filters.jurisdiction_level:
        query = query.filter(
            Politician.jurisdiction_level == filters.jurisdiction_level
        )
        count_query = count_query.filter(
            Politician.jurisdiction_level == filters.jurisdiction_level
        )

    if filters.party:
        query = query.filter(Politician.party.ilike(f"%{filters.party}%"))
        count_query = count_query.filter(Politician.party.ilike(f"%{filters.party}%"))

    if filters.state:
        query = query.filter(Politician.state == filters.state)
        count_query = count_query.filter(Politician.state == filters.state)

    if filters.is_current is not None:
        query = query.filter(Politician.is_current == filters.is_current)
        count_query = count_query.filter(Politician.is_current == filters.is_current)

    # Search across name fields
    if filters.search:
        search_pattern = f"%{filters.search}%"
        search_condition = or_(
            Politician.first_name.ilike(search_pattern),
            Politician.last_name.ilike(search_pattern),
            Politician.full_name.ilike(search_pattern),
            Politician.bio.ilike(search_pattern),
        )
        query = query.filter(search_condition)
        count_query = count_query.filter(search_condition)

    return query, count_query


# ============================================================================
# API Endpoints
# ============================================================================


@router.get(
    "/",
    response_model=PoliticianListResponse,
    summary="List all politicians",
    description="Get a paginated list of politicians with optional filtering and search",
    responses={
        200: {"description": "Successfully retrieved politician list"},
        400: {"description": "Invalid query parameters"},
    },
)
async def list_politicians(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    office_type: Optional[str] = None,
    jurisdiction_level: Optional[str] = None,
    party: Optional[str] = None,
    state: Optional[str] = None,
    is_current: Optional[bool] = None,
    search: Optional[str] = None,
    sort_by: str = Query("term_start", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order (asc/desc)"),
    db: Session = Depends(get_db),
):
    """
    List politicians with filtering and pagination.

    ### Filters:
    - **office_type**: Filter by office type (president, senator, representative, etc.)
    - **jurisdiction_level**: Filter by government level (federal, state, local)
    - **party**: Filter by political party (case-insensitive partial match)
    - **state**: Filter by state abbreviation
    - **is_current**: Filter by current status (true/false)
    - **search**: Search across name and bio fields

    ### Sorting:
    - **sort_by**: Field to sort by (default: term_start)
    - **sort_order**: Sort direction (asc/desc, default: desc)

    ### Returns:
    - Paginated list of politicians with metadata
    """
    # Build filter object
    filters = PoliticianFilter(
        office_type=office_type,
        jurisdiction_level=jurisdiction_level,
        party=party,
        state=state,
        is_current=is_current,
        search=search,
    )

    # Build query
    query, count_query = build_politician_query(db, filters)

    # Get total count
    total = count_query.scalar()

    # Apply sorting
    valid_sort_fields = ["first_name", "last_name", "term_start", "term_end", "party"]
    if sort_by not in valid_sort_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sort field. Must be one of: {', '.join(valid_sort_fields)}",
        )

    sort_column = getattr(Politician, sort_by)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    # Apply pagination
    offset = (page - 1) * page_size
    politicians = query.offset(offset).limit(page_size).all()

    # Calculate total pages
    total_pages = (total + page_size - 1) // page_size

    return PoliticianListResponse(
        politicians=[
            PoliticianResponse(
                id=p.id,
                full_name=p.full_name or f"{p.first_name} {p.last_name}",
                office_title=p.office_title,
                party=p.party,
                state=p.state,
                is_current=p.is_current,
                term_start=p.term_start,
            )
            for p in politicians
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get(
    "/{politician_id}",
    response_model=PoliticianDetailResponse,
    summary="Get politician by ID",
    description="Retrieve detailed information about a specific politician",
    responses={
        200: {"description": "Successfully retrieved politician details"},
        404: {"description": "Politician not found"},
    },
)
async def get_politician(
    politician_id: int,
    db: Session = Depends(get_db),
):
    """
    Get detailed information about a specific politician.

    Includes:
    - Basic information (name, office, party, state)
    - Term dates and years in office
    - Bio and contact information
    - Counts of actions, votes, and promises
    - Latest transparency score and rank
    """
    # Fetch politician
    politician = db.query(Politician).filter(Politician.id == politician_id).first()

    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician with ID {politician_id} not found",
        )

    # Get counts
    action_count = (
        db.query(Action).filter(Action.politician_id == politician_id).count()
    )
    vote_count = db.query(Vote).filter(Vote.politician_id == politician_id).count()
    promise_count = (
        db.query(Promise).filter(Promise.politician_id == politician_id).count()
    )

    # Get latest transparency score
    latest_score = (
        db.query(TransparencyScore)
        .filter(TransparencyScore.politician_id == politician_id)
        .order_by(TransparencyScore.calculated_at.desc())
        .first()
    )

    # Calculate years in office
    from datetime import datetime

    end_date = politician.term_end or datetime.utcnow()
    years_in_office = (end_date - politician.term_start).days // 365

    return PoliticianDetailResponse(
        id=politician.id,
        first_name=politician.first_name,
        last_name=politician.last_name,
        middle_name=politician.middle_name,
        full_name=politician.full_name
        or f"{politician.first_name} {politician.last_name}",
        office_title=politician.office_title,
        office_type=politician.office_type.value,
        jurisdiction_level=politician.jurisdiction_level.value,
        party=politician.party,
        state=politician.state,
        district=politician.district,
        term_start=politician.term_start,
        term_end=politician.term_end,
        is_current=politician.is_current,
        bio=politician.bio,
        website_url=politician.website_url,
        social_media=politician.social_media,
        years_in_office=years_in_office,
        action_count=action_count,
        vote_count=vote_count,
        promise_count=promise_count,
        latest_transparency_score=latest_score.overall_score if latest_score else None,
        transparency_rank=latest_score.rank if latest_score else None,
    )


@router.post(
    "/",
    response_model=PoliticianDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new politician",
    description="Add a new politician to the database",
    responses={
        201: {"description": "Politician created successfully"},
        400: {"description": "Validation error"},
    },
)
async def create_politician(
    politician_data: PoliticianCreate,
    db: Session = Depends(get_db),
):
    """
    Create a new politician record.

    This endpoint is typically used during data import or by administrators.
    Requires proper authentication in production.
    """
    # Create full_name if not provided
    full_name = politician_data.first_name + " " + politician_data.last_name
    if politician_data.middle_name:
        full_name += " " + politician_data.middle_name

    # Create politician object
    politician = Politician(
        first_name=politician_data.first_name,
        last_name=politician_data.last_name,
        middle_name=politician_data.middle_name,
        full_name=full_name,
        office_title=politician_data.office_title,
        office_type=OfficeType(politician_data.office_type),
        jurisdiction_level=JurisdictionLevel(politician_data.jurisdiction_level),
        party=politician_data.party,
        state=politician_data.state,
        district=politician_data.district,
        term_start=politician_data.term_start,
        term_end=politician_data.term_end,
        is_current=True,
        bio=politician_data.bio,
        website_url=politician_data.website_url,
    )

    db.add(politician)
    db.commit()
    db.refresh(politician)

    # Return created politician with details
    return await get_politician(politician.id, db)


@router.put(
    "/{politician_id}",
    response_model=PoliticianDetailResponse,
    summary="Update politician",
    description="Update an existing politician's information",
    responses={
        200: {"description": "Politician updated successfully"},
        404: {"description": "Politician not found"},
        400: {"description": "Validation error"},
    },
)
async def update_politician(
    politician_id: int,
    politician_data: PoliticianUpdate,
    db: Session = Depends(get_db),
):
    """
    Update a politician's information.

    Only provided fields will be updated. Other fields remain unchanged.
    """
    politician = db.query(Politician).filter(Politician.id == politician_id).first()

    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician with ID {politician_id} not found",
        )

    # Update fields if provided
    update_data = politician_data.dict(exclude_unset=True)

    for key, value in update_data.items():
        if value is not None:
            setattr(politician, key, value)

    # Update full_name if name fields changed
    if "first_name" in update_data or "last_name" in update_data:
        politician.full_name = politician.first_name + " " + politician.last_name
        if politician.middle_name:
            politician.full_name += " " + politician.middle_name

    db.commit()
    db.refresh(politician)

    return await get_politician(politician_id, db)


@router.delete(
    "/{politician_id}",
    summary="Delete politician",
    description="Remove a politician from the database (soft delete preferred in production)",
    responses={
        200: {"description": "Politician deleted successfully"},
        404: {"description": "Politician not found"},
    },
)
async def delete_politician(
    politician_id: int,
    db: Session = Depends(get_db),
):
    """
    Delete a politician.

    ⚠️ WARNING: This is a hard delete and will remove all associated data.
    In production, consider implementing soft deletes instead.
    """
    politician = db.query(Politician).filter(Politician.id == politician_id).first()

    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician with ID {politician_id} not found",
        )

    db.delete(politician)
    db.commit()

    return {"message": f"Politician {politician_id} deleted successfully"}


@router.get(
    "/{politician_id}/actions",
    summary="Get politician's actions",
    description="Retrieve all actions taken by a specific politician",
)
async def get_politician_actions(
    politician_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Get actions for a specific politician"""
    politician = db.query(Politician).filter(Politician.id == politician_id).first()

    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician with ID {politician_id} not found",
        )

    # Query actions with pagination
    offset = (page - 1) * page_size
    actions = (
        db.query(Action)
        .filter(Action.politician_id == politician_id)
        .order_by(Action.action_date.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return {
        "politician_id": politician_id,
        "politician_name": politician.full_name,
        "actions": [
            {
                "id": a.id,
                "action_type": a.action_type.value
                if hasattr(a.action_type, "value")
                else a.action_type,
                "title": a.title,
                "action_date": a.action_date,
                "status": a.status,
            }
            for a in actions
        ],
        "page": page,
        "page_size": page_size,
    }


@router.get(
    "/{politician_id}/votes",
    summary="Get politician's voting record",
    description="Retrieve all votes cast by a specific politician",
)
async def get_politician_votes(
    politician_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Get voting record for a specific politician"""
    politician = db.query(Politician).filter(Politician.id == politician_id).first()

    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician with ID {politician_id} not found",
        )

    # Query votes with pagination
    offset = (page - 1) * page_size
    votes = (
        db.query(Vote)
        .filter(Vote.politician_id == politician_id)
        .order_by(Vote.vote_date.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return {
        "politician_id": politician_id,
        "politician_name": politician.full_name,
        "votes": [
            {
                "id": v.id,
                "vote_type": v.vote_type,
                "vote_date": v.vote_date,
                "roll_call_number": v.roll_call_number,
                "vote_description": v.vote_description,
            }
            for v in votes
        ],
        "page": page,
        "page_size": page_size,
    }


@router.get(
    "/{politician_id}/promises",
    summary="Get politician's promises",
    description="Retrieve all campaign promises made by a specific politician",
)
async def get_politician_promises(
    politician_id: int,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Get promises for a specific politician"""
    politician = db.query(Politician).filter(Politician.id == politician_id).first()

    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician with ID {politician_id} not found",
        )

    # Build query
    query = db.query(Promise).filter(Promise.politician_id == politician_id)

    if status:
        try:
            promise_status = PromiseStatus(status)
            query = query.filter(Promise.fulfillment_status == promise_status)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid promise status: {status}",
            )

    # Pagination
    offset = (page - 1) * page_size
    promises = (
        query.order_by(Promise.promise_date.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return {
        "politician_id": politician_id,
        "politician_name": politician.full_name,
        "promises": [
            {
                "id": p.id,
                "promise_text": p.promise_text,
                "promise_date": p.promise_date,
                "fulfillment_status": p.fulfillment_status.value
                if hasattr(p.fulfillment_status, "value")
                else p.fulfillment_status,
                "fulfillment_score": p.fulfillment_score,
                "deadline": p.deadline,
            }
            for p in promises
        ],
        "page": page,
        "page_size": page_size,
    }


@router.get(
    "/{politician_id}/transparency-score",
    summary="Get politician's transparency score",
    description="Retrieve transparency score and history for a politician",
)
async def get_politician_transparency_score(
    politician_id: int,
    history_days: int = Query(
        365, ge=30, le=3650, description="Days of history to include"
    ),
    db: Session = Depends(get_db),
):
    """Get transparency score and trend for a politician"""
    from datetime import timedelta

    politician = db.query(Politician).filter(Politician.id == politician_id).first()

    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician with ID {politician_id} not found",
        )

    # Get latest score
    latest_score = (
        db.query(TransparencyScore)
        .filter(TransparencyScore.politician_id == politician_id)
        .order_by(TransparencyScore.calculated_at.desc())
        .first()
    )

    # Get score history
    cutoff_date = datetime.utcnow() - timedelta(days=history_days)
    score_history = (
        db.query(TransparencyScore)
        .filter(
            TransparencyScore.politician_id == politician_id,
            TransparencyScore.calculated_at >= cutoff_date,
        )
        .order_by(TransparencyScore.calculated_at)
        .all()
    )

    if not latest_score:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No transparency score found for politician {politician_id}",
        )

    return {
        "politician_id": politician_id,
        "politician_name": politician.full_name,
        "latest_score": {
            "overall_score": latest_score.overall_score,
            "letter_grade": latest_score.letter_grade,
            "star_rating": latest_score.star_rating,
            "rank": latest_score.rank,
            "peer_group": latest_score.peer_group,
            "trend": latest_score.trend,
            "trend_magnitude": latest_score.trend_magnitude,
            "calculated_at": latest_score.calculated_at,
        },
        "score_history": [
            {
                "date": s.calculated_at,
                "score": s.overall_score,
                "grade": s.letter_grade,
            }
            for s in score_history
        ],
    }

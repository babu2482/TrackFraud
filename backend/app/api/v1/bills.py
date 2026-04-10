"""
Bills/Legislation API Endpoints for The Glass House

This module provides RESTful endpoints for managing and querying legislative bills
across all levels of government (federal, state, local).

Endpoints include:
- List bills with filtering, pagination, and search
- Get individual bill details
- Get bill votes, sponsors, and actions
- Track bill status and progress
- AI-powered bill analysis and predictions

All endpoints use proper validation, error handling, and async where appropriate.
"""

from typing import List, Optional

from app.core.config import get_settings
from app.db.database import get_db
from app.db.models import Bill, BillSponsor, Vote, VoteResult
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

router = APIRouter()

settings = get_settings()


# ============================================================================
# Pydantic Schemas
# ============================================================================

from datetime import datetime

from pydantic import BaseModel, Field


class BillBase(BaseModel):
    """Base bill schema"""

    congress_number: int
    bill_number: str
    bill_type: str
    title: str
    short_title: Optional[str] = None
    summary: Optional[str] = None
    introduced_date: Optional[datetime] = None
    status: Optional[str] = None


class BillCreate(BillBase):
    """Schema for creating a new bill"""

    full_text: Optional[str] = None
    topics: Optional[list] = None


class BillUpdate(BaseModel):
    """Schema for updating a bill"""

    short_title: Optional[str] = None
    summary: Optional[str] = None
    full_text: Optional[str] = None
    status: Optional[str] = None
    outcome: Optional[str] = None
    topics: Optional[list] = None


class BillResponse(BaseModel):
    """Schema for bill list items"""

    id: int
    bill_number: str
    title: str
    status: Optional[str]
    introduced_date: Optional[datetime]
    sponsor_count: int
    vote_count: int

    class Config:
        from_attributes = True


class BillDetailResponse(BaseModel):
    """Schema for full bill details"""

    id: int
    congress_number: int
    session: Optional[int]
    bill_number: str
    bill_type: str
    title: str
    short_title: Optional[str]
    summary: Optional[str]
    full_text: Optional[str]
    introduced_date: Optional[datetime]
    enacted_date: Optional[datetime]
    effective_date: Optional[datetime]
    status: Optional[str]
    outcome: Optional[str]
    topics: Optional[list]
    sponsor_count: int
    vote_count: int
    yea_count: Optional[int]
    nay_count: Optional[int]
    source_url: Optional[str]
    external_id: Optional[str]
    ai_summary: Optional[str]
    predicted_outcome: Optional[str]
    predicted_confidence: Optional[float]

    class Config:
        from_attributes = True


class BillSponsorResponse(BaseModel):
    """Schema for bill sponsor"""

    id: int
    first_name: str
    last_name: str
    party: Optional[str]
    state: Optional[str]
    is_primary: bool
    sponsor_type: str
    sponsorship_date: datetime

    class Config:
        from_attributes = True


class BillVoteResponse(BaseModel):
    """Schema for bill vote"""

    id: int
    vote_type: str
    vote_date: datetime
    roll_call_number: Optional[str]
    result: Optional[str]
    yeas: Optional[int]
    nays: Optional[int]
    source_url: Optional[str]

    class Config:
        from_attributes = True


class BillListResponse(BaseModel):
    """Schema for paginated bill list"""

    bills: List[BillResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

    class Config:
        from_attributes = True


# ============================================================================
# Query Parameter Models
# ============================================================================


class BillFilter(BaseModel):
    """Filter parameters for bill queries"""

    congress_number: Optional[int] = None
    bill_type: Optional[str] = None
    status: Optional[str] = None
    outcome: Optional[str] = None
    search: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


# ============================================================================
# Helper Functions
# ============================================================================


def build_bill_query(db: Session, filters: BillFilter) -> tuple:
    """
    Build a SQLAlchemy query for bills with filters.

    Returns:
        tuple: (query, total_count)
    """
    query = db.query(Bill)
    count_query = db.query(func.count(Bill.id))

    # Apply filters
    if filters.congress_number:
        query = query.filter(Bill.congress_number == filters.congress_number)
        count_query = count_query.filter(
            Bill.congress_number == filters.congress_number
        )

    if filters.bill_type:
        query = query.filter(Bill.bill_type.ilike(f"%{filters.bill_type}%"))
        count_query = count_query.filter(Bill.bill_type.ilike(f"%{filters.bill_type}%"))

    if filters.status:
        query = query.filter(Bill.status.ilike(f"%{filters.status}%"))
        count_query = count_query.filter(Bill.status.ilike(f"%{filters.status}%"))

    if filters.outcome:
        query = query.filter(Bill.outcome.ilike(f"%{filters.outcome}%"))
        count_query = count_query.filter(Bill.outcome.ilike(f"%{filters.outcome}%"))

    # Date range filters
    if filters.start_date:
        query = query.filter(Bill.introduced_date >= filters.start_date)
        count_query = count_query.filter(Bill.introduced_date >= filters.start_date)

    if filters.end_date:
        query = query.filter(Bill.introduced_date <= filters.end_date)
        count_query = count_query.filter(Bill.introduced_date <= filters.end_date)

    # Search across title and summary
    if filters.search:
        search_pattern = f"%{filters.search}%"
        search_condition = or_(
            Bill.title.ilike(search_pattern),
            Bill.short_title.ilike(search_pattern),
            Bill.summary.ilike(search_pattern),
            Bill.bill_number.ilike(search_pattern),
        )
        query = query.filter(search_condition)
        count_query = count_query.filter(search_condition)

    return query, count_query


# ============================================================================
# API Endpoints
# ============================================================================


@router.get(
    "/",
    response_model=BillListResponse,
    summary="List all bills",
    description="Get a paginated list of bills with optional filtering and search",
    responses={
        200: {"description": "Successfully retrieved bill list"},
        400: {"description": "Invalid query parameters"},
    },
)
async def list_bills(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    congress_number: Optional[int] = None,
    bill_type: Optional[str] = None,
    status: Optional[str] = None,
    outcome: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    search: Optional[str] = None,
    sort_by: str = Query("introduced_date", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order (asc/desc)"),
    db: Session = Depends(get_db),
):
    """
    List bills with filtering and pagination.

    ### Filters:
    - **congress_number**: Filter by congress session number
    - **bill_type**: Filter by bill type (H.R., S., H.J. Res., etc.)
    - **status**: Filter by status (Introduced, Passed House, Enacted, etc.)
    - **outcome**: Filter by outcome (enacted, vetoed, failed, withdrawn)
    - **start_date**: Filter bills introduced after this date
    - **end_date**: Filter bills introduced before this date
    - **search**: Search across title, summary, and bill number

    ### Sorting:
    - **sort_by**: Field to sort by (default: introduced_date)
    - **sort_order**: Sort direction (asc/desc, default: desc)

    ### Returns:
    - Paginated list of bills with metadata
    """
    # Build filter object
    filters = BillFilter(
        congress_number=congress_number,
        bill_type=bill_type,
        status=status,
        outcome=outcome,
        start_date=start_date,
        end_date=end_date,
        search=search,
    )

    # Build query
    query, count_query = build_bill_query(db, filters)

    # Get total count
    total = count_query.scalar()

    # Apply sorting
    valid_sort_fields = [
        "bill_number",
        "title",
        "introduced_date",
        "status",
        "congress_number",
    ]
    if sort_by not in valid_sort_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sort field. Must be one of: {', '.join(valid_sort_fields)}",
        )

    sort_column = getattr(Bill, sort_by)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    # Apply pagination
    offset = (page - 1) * page_size
    bills = query.offset(offset).limit(page_size).all()

    # Calculate total pages
    total_pages = (total + page_size - 1) // page_size

    # Get sponsor and vote counts for each bill
    bill_data = []
    for bill in bills:
        sponsor_count = (
            db.query(BillSponsor).filter(BillSponsor.bill_id == bill.id).count()
        )
        vote_count = db.query(Vote).filter(Vote.bill_id == bill.id).count()

        bill_data.append(
            BillResponse(
                id=bill.id,
                bill_number=f"{bill.bill_type} {bill.bill_number}",
                title=bill.title,
                status=bill.status,
                introduced_date=bill.introduced_date,
                sponsor_count=sponsor_count,
                vote_count=vote_count,
            )
        )

    return BillListResponse(
        bills=bill_data,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get(
    "/{bill_id}",
    response_model=BillDetailResponse,
    summary="Get bill by ID",
    description="Retrieve detailed information about a specific bill",
    responses={
        200: {"description": "Successfully retrieved bill details"},
        404: {"description": "Bill not found"},
    },
)
async def get_bill(
    bill_id: int,
    db: Session = Depends(get_db),
):
    """
    Get detailed information about a specific bill.

    Includes:
    - Basic information (number, title, summary)
    - Legislative history (dates, status, outcome)
    - Sponsor and vote counts
    - AI analysis (summary, predictions)
    """
    # Fetch bill
    bill = db.query(Bill).filter(Bill.id == bill_id).first()

    if not bill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bill with ID {bill_id} not found",
        )

    # Get sponsor count
    sponsor_count = db.query(BillSponsor).filter(BillSponsor.bill_id == bill.id).count()

    # Get vote count and results
    vote_count = db.query(Vote).filter(Vote.bill_id == bill.id).count()

    # Get vote results (aggregate)
    vote_results = (
        db.query(VoteResult)
        .filter(VoteResult.bill_id == bill.id)
        .order_by(VoteResult.id.desc())
        .first()
    )

    return BillDetailResponse(
        id=bill.id,
        congress_number=bill.congress_number,
        session=bill.session,
        bill_number=bill.bill_number,
        bill_type=bill.bill_type,
        title=bill.title,
        short_title=bill.short_title,
        summary=bill.summary,
        full_text=bill.full_text,
        introduced_date=bill.introduced_date,
        enacted_date=bill.enacted_date,
        effective_date=bill.effective_date,
        status=bill.status,
        outcome=bill.outcome,
        topics=bill.topics,
        sponsor_count=sponsor_count,
        vote_count=vote_count,
        yea_count=vote_results.yeas if vote_results else None,
        nay_count=vote_results.nays if vote_results else None,
        source_url=bill.source_url,
        external_id=bill.external_id,
        ai_summary=bill.ai_summary,
        predicted_outcome=bill.predicted_outcome,
        predicted_confidence=bill.predicted_confidence,
    )


@router.post(
    "/",
    response_model=BillDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new bill",
    description="Add a new bill to the database",
    responses={
        201: {"description": "Bill created successfully"},
        400: {"description": "Validation error"},
    },
)
async def create_bill(
    bill_data: BillCreate,
    db: Session = Depends(get_db),
):
    """
    Create a new bill record.

    This endpoint is typically used during data import or by administrators.
    Requires proper authentication in production.
    """
    # Check if bill already exists
    existing = (
        db.query(Bill)
        .filter(
            Bill.congress_number == bill_data.congress_number,
            Bill.bill_number == bill_data.bill_number,
            Bill.bill_type == bill_data.bill_type,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bill {bill_data.bill_type} {bill_data.bill_number} already exists in congress {bill_data.congress_number}",
        )

    # Create bill object
    bill = Bill(
        congress_number=bill_data.congress_number,
        bill_number=bill_data.bill_number,
        bill_type=bill_data.bill_type,
        title=bill_data.title,
        short_title=bill_data.short_title,
        summary=bill_data.summary,
        full_text=bill_data.full_text,
        introduced_date=bill_data.introduced_date,
        status=bill_data.status,
        topics=bill_data.topics,
    )

    db.add(bill)
    db.commit()
    db.refresh(bill)

    # Return created bill with details
    return await get_bill(bill.id, db)


@router.put(
    "/{bill_id}",
    response_model=BillDetailResponse,
    summary="Update bill",
    description="Update an existing bill's information",
    responses={
        200: {"description": "Bill updated successfully"},
        404: {"description": "Bill not found"},
        400: {"description": "Validation error"},
    },
)
async def update_bill(
    bill_id: int,
    bill_data: BillUpdate,
    db: Session = Depends(get_db),
):
    """
    Update a bill's information.

    Only provided fields will be updated. Other fields remain unchanged.
    """
    bill = db.query(Bill).filter(Bill.id == bill_id).first()

    if not bill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bill with ID {bill_id} not found",
        )

    # Update fields if provided
    update_data = bill_data.dict(exclude_unset=True)

    for key, value in update_data.items():
        if value is not None:
            setattr(bill, key, value)

    db.commit()
    db.refresh(bill)

    return await get_bill(bill_id, db)


@router.delete(
    "/{bill_id}",
    summary="Delete bill",
    description="Remove a bill from the database (soft delete preferred in production)",
    responses={
        200: {"description": "Bill deleted successfully"},
        404: {"description": "Bill not found"},
    },
)
async def delete_bill(
    bill_id: int,
    db: Session = Depends(get_db),
):
    """
    Delete a bill.

    ⚠️ WARNING: This is a hard delete and will remove all associated data.
    In production, consider implementing soft deletes instead.
    """
    bill = db.query(Bill).filter(Bill.id == bill_id).first()

    if not bill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bill with ID {bill_id} not found",
        )

    db.delete(bill)
    db.commit()

    return {"message": f"Bill {bill_id} deleted successfully"}


@router.get(
    "/{bill_id}/sponsors",
    summary="Get bill sponsors",
    description="Retrieve all sponsors and co-sponsors for a bill",
)
async def get_bill_sponsors(
    bill_id: int,
    is_primary: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Get sponsors for a specific bill"""
    bill = db.query(Bill).filter(Bill.id == bill_id).first()

    if not bill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bill with ID {bill_id} not found",
        )

    # Build query
    query = db.query(BillSponsor).filter(BillSponsor.bill_id == bill_id)

    if is_primary is not None:
        query = query.filter(BillSponsor.is_primary == is_primary)

    # Pagination
    offset = (page - 1) * page_size
    sponsors = (
        query.order_by(BillSponsor.is_primary.desc(), BillSponsor.sponsorship_date)
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return {
        "bill_id": bill_id,
        "bill_number": f"{bill.bill_type} {bill.bill_number}",
        "sponsors": [
            BillSponsorResponse(
                id=s.id,
                first_name=s.first_name,
                last_name=s.last_name,
                party=s.party,
                state=s.state,
                is_primary=s.is_primary,
                sponsor_type=s.sponsor_type,
                sponsorship_date=s.sponsorship_date,
            )
            for s in sponsors
        ],
        "page": page,
        "page_size": page_size,
    }


@router.get(
    "/{bill_id}/votes",
    summary="Get bill votes",
    description="Retrieve all votes and vote results for a bill",
)
async def get_bill_votes(
    bill_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Get votes for a specific bill"""
    bill = db.query(Bill).filter(Bill.id == bill_id).first()

    if not bill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bill with ID {bill_id} not found",
        )

    # Get vote results
    vote_results = db.query(VoteResult).filter(VoteResult.bill_id == bill_id).all()

    # Get individual votes with pagination
    offset = (page - 1) * page_size
    votes = (
        db.query(Vote)
        .filter(Vote.bill_id == bill_id)
        .order_by(Vote.vote_date.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    # Count votes by type
    yea_count = (
        db.query(Vote).filter(Vote.bill_id == bill_id, Vote.vote_type == "YEA").count()
    )
    nay_count = (
        db.query(Vote).filter(Vote.bill_id == bill_id, Vote.vote_type == "NAY").count()
    )
    present_count = (
        db.query(Vote)
        .filter(Vote.bill_id == bill_id, Vote.vote_type == "PRESENT")
        .count()
    )

    return {
        "bill_id": bill_id,
        "bill_number": f"{bill.bill_type} {bill.bill_number}",
        "vote_results": [
            {
                "id": v.id,
                "vote_type": v.vote_type,
                "vote_date": v.vote_date,
                "result": v.result,
                "yeas": v.yeas,
                "nays": v.nays,
                "present": v.present,
                "source_url": v.source_url,
            }
            for v in vote_results
        ],
        "summary": {
            "yea": yea_count,
            "nay": nay_count,
            "present": present_count,
            "total": yea_count + nay_count + present_count,
        },
        "individual_votes": [
            BillVoteResponse(
                id=v.id,
                vote_type=v.vote_type,
                vote_date=v.vote_date,
                roll_call_number=v.roll_call_number,
                result=v.vote_description,
                source_url=v.source_url,
            )
            for v in votes
        ],
        "page": page,
        "page_size": page_size,
    }


@router.get(
    "/{bill_id}/predict",
    summary="Get bill prediction",
    description="Retrieve AI-powered prediction for bill passage probability",
)
async def get_bill_prediction(
    bill_id: int,
    db: Session = Depends(get_db),
):
    """Get AI prediction for a specific bill"""
    bill = db.query(Bill).filter(Bill.id == bill_id).first()

    if not bill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bill with ID {bill_id} not found",
        )

    # If prediction already exists, return it
    if bill.predicted_outcome and bill.predicted_confidence:
        return {
            "bill_id": bill_id,
            "bill_number": f"{bill.bill_type} {bill.bill_number}",
            "prediction": {
                "predicted_outcome": bill.predicted_outcome,
                "predicted_confidence": bill.predicted_confidence,
                "ai_summary": bill.ai_summary,
                "note": "Using cached prediction",
            },
        }

    # Generate new prediction using AI service
    # This would integrate with the predictor.py AI service
    from app.ai.predictor import get_prediction_service

    try:
        prediction_service = get_prediction_service()

        # Get bill context data
        bill_data = {
            "id": bill.id,
            "bill_type": bill.bill_type,
            "sponsor_id": "unknown",  # Would get from sponsors
            "topic": bill.topics[0]
            if bill.topics and len(bill.topics) > 0
            else "general",
            "congress_number": bill.congress_number,
            "introduced_date": bill.introduced_date,
        }

        prediction = prediction_service.predict_bill_outcome(bill_data)

        # Update bill with prediction
        bill.predicted_outcome = prediction.predicted_class
        bill.predicted_confidence = prediction.confidence
        bill.ai_summary = prediction.explanation

        db.commit()

        return {
            "bill_id": bill_id,
            "bill_number": f"{bill.bill_type} {bill.bill_number}",
            "prediction": {
                "predicted_outcome": prediction.predicted_class,
                "predicted_value": prediction.predicted_value,
                "predicted_confidence": prediction.confidence,
                "confidence_level": prediction.confidence_level.value,
                "explanation": prediction.explanation,
                "factors": prediction.factors,
                "similar_cases": prediction.similar_cases,
            },
        }

    except Exception as e:
        # Return fallback if AI service unavailable
        return {
            "bill_id": bill_id,
            "bill_number": f"{bill.bill_type} {bill.bill_number}",
            "prediction": {
                "predicted_outcome": "unknown",
                "predicted_confidence": 0.0,
                "error": str(e),
                "note": "AI prediction service unavailable",
            },
        }


@router.get(
    "/{bill_id}/history",
    summary="Get bill legislative history",
    description="Retrieve the legislative timeline and status changes for a bill",
)
async def get_bill_history(
    bill_id: int,
    db: Session = Depends(get_db),
):
    """Get legislative history for a specific bill"""
    bill = db.query(Bill).filter(Bill.id == bill_id).first()

    if not bill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bill with ID {bill_id} not found",
        )

    # Get bill actions (would come from Actions model)
    # For now, return status timeline
    history = []

    # Add key dates
    if bill.introduced_date:
        history.append(
            {
                "date": bill.introduced_date,
                "event": "Introduced",
                "description": f"Bill {bill.bill_type} {bill.bill_number} was introduced",
            }
        )

    if bill.enacted_date:
        history.append(
            {
                "date": bill.enacted_date,
                "event": "Enacted",
                "description": "Bill was enacted into law",
            }
        )

    if bill.effective_date and bill.effective_date != bill.enacted_date:
        history.append(
            {
                "date": bill.effective_date,
                "event": "Effective",
                "description": "Bill became effective",
            }
        )

    # Add current status
    if bill.status:
        history.append(
            {
                "date": datetime.utcnow(),
                "event": "Current Status",
                "description": f"Current status: {bill.status}",
            }
        )

    # Add outcome if available
    if bill.outcome:
        history.append(
            {
                "date": datetime.utcnow(),
                "event": "Outcome",
                "description": f"Final outcome: {bill.outcome}",
            }
        )

    return {
        "bill_id": bill_id,
        "bill_number": f"{bill.bill_type} {bill.bill_number}",
        "title": bill.title,
        "history": sorted(history, key=lambda x: x["date"], reverse=True),
    }

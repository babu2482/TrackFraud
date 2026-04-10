"""
Votes API Endpoints for The Glass House

This module provides RESTful endpoints for managing and querying voting records
across all levels of government.

Endpoints include:
- List votes with filtering and pagination
- Get individual vote details
- Get votes by politician, bill, or date range
- Analyze voting patterns and trends
- Create/update voting records (for data import)

All endpoints use proper validation, error handling, and async where appropriate.
"""

from datetime import datetime
from typing import Dict, List, Optional

from app.core.config import get_settings
from app.db.database import get_db
from app.db.models import Bill, Politician, Vote, VoteResult
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

router = APIRouter()

settings = get_settings()


# ==================================================================================
# Pydantic Schemas
# ==================================================================================


class VoteBase(BaseModel):
    """Base vote schema"""

    vote_type: str = Field(..., description="Vote type: YEA, NAY, PRESENT, ABSENT")
    vote_date: datetime = Field(..., description="Date of the vote")
    chamber: Optional[str] = Field(None, description="House or Senate")
    roll_call_number: Optional[str] = Field(None, description="Roll call vote number")
    vote_description: Optional[str] = Field(
        None, description="Description of what was voted on"
    )


class VoteCreate(VoteBase):
    """Schema for creating a new vote record"""

    politician_id: int = Field(..., description="ID of the politician who voted")
    bill_id: Optional[int] = Field(None, description="ID of the bill being voted on")
    source_url: Optional[str] = Field(
        None, description="Source URL for the vote record"
    )


class VoteUpdate(BaseModel):
    """Schema for updating a vote record"""

    vote_type: Optional[str] = None
    vote_date: Optional[datetime] = None
    chamber: Optional[str] = None
    roll_call_number: Optional[str] = None
    vote_description: Optional[str] = None
    source_url: Optional[str] = None


class VoteResponse(BaseModel):
    """Schema for vote list items"""

    id: int
    politician_id: int
    politician_name: str
    vote_type: str
    vote_date: datetime
    roll_call_number: Optional[str]
    vote_description: Optional[str]

    class Config:
        from_attributes = True


class VoteDetailResponse(BaseModel):
    """Schema for full vote details"""

    id: int
    politician_id: int
    politician_name: str
    politician_party: Optional[str]
    bill_id: Optional[int]
    bill_number: Optional[str]
    bill_title: Optional[str]
    vote_type: str
    vote_date: datetime
    chamber: Optional[str]
    session_number: Optional[int]
    roll_call_number: Optional[str]
    public_record: bool
    vote_description: Optional[str]
    source_url: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class VoteListResponse(BaseModel):
    """Schema for paginated vote list"""

    votes: List[VoteResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    summary: Dict[str, int]

    class Config:
        from_attributes = True


class VoteStatistics(BaseModel):
    """Schema for vote statistics"""

    politician_id: int
    politician_name: str
    total_votes: int
    yea_votes: int
    nay_votes: int
    present_votes: int
    absent_votes: int
    yea_percentage: float
    nay_percentage: float
    attendance_rate: float
    party_alignment_rate: Optional[float] = None


class VoteAnalysisResponse(BaseModel):
    """Schema for vote analysis results"""

    date_range: Dict[str, datetime]
    politician_votes: List[VoteStatistics]
    bill_votes: List[Dict[str, any]]
    party_breakdown: Dict[str, Dict[str, int]]
    temporal_patterns: Dict[str, any]


# ==================================================================================
# Query Parameter Models
# ==================================================================================


class VoteFilter(BaseModel):
    """Filter parameters for vote queries"""

    politician_id: Optional[int] = None
    bill_id: Optional[int] = None
    vote_type: Optional[str] = None
    chamber: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    roll_call_number: Optional[str] = None


# ==================================================================================
# Helper Functions
# ==================================================================================


def build_vote_query(
    db: Session,
    filters: VoteFilter,
) -> tuple:
    """
    Build a SQLAlchemy query for votes with filters.

    Returns:
        tuple: (query, total_count)
    """
    query = db.query(Vote)
    count_query = db.query(func.count(Vote.id))

    # Apply filters
    if filters.politician_id:
        query = query.filter(Vote.politician_id == filters.politician_id)
        count_query = count_query.filter(Vote.politician_id == filters.politician_id)

    if filters.bill_id:
        query = query.filter(Vote.bill_id == filters.bill_id)
        count_query = count_query.filter(Vote.bill_id == filters.bill_id)

    if filters.vote_type:
        query = query.filter(Vote.vote_type == filters.vote_type)
        count_query = count_query.filter(Vote.vote_type == filters.vote_type)

    if filters.chamber:
        query = query.filter(Vote.chamber == filters.chamber)
        count_query = count_query.filter(Vote.chamber == filters.chamber)

    if filters.start_date:
        query = query.filter(Vote.vote_date >= filters.start_date)
        count_query = count_query.filter(Vote.vote_date >= filters.start_date)

    if filters.end_date:
        query = query.filter(Vote.vote_date <= filters.end_date)
        count_query = count_query.filter(Vote.vote_date <= filters.end_date)

    if filters.roll_call_number:
        query = query.filter(Vote.roll_call_number == filters.roll_call_number)
        count_query = count_query.filter(
            Vote.roll_call_number == filters.roll_call_number
        )

    return query, count_query


def get_vote_summary(votes: List[Vote]) -> Dict[str, int]:
    """Calculate vote type summary"""
    summary = {
        "yea": 0,
        "nay": 0,
        "present": 0,
        "absent": 0,
    }

    for vote in votes:
        vote_type = vote.vote_type.upper()
        if vote_type in summary:
            summary[vote_type] += 1

    return summary


# ==================================================================================
# API Endpoints
# ==================================================================================


@router.get(
    "/",
    response_model=VoteListResponse,
    summary="List all votes",
    description="Get a paginated list of votes with optional filtering",
    responses={
        200: {"description": "Successfully retrieved vote list"},
        400: {"description": "Invalid query parameters"},
    },
)
async def list_votes(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    politician_id: Optional[int] = None,
    bill_id: Optional[int] = None,
    vote_type: Optional[str] = None,
    chamber: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    sort_by: str = Query("vote_date", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order (asc/desc)"),
    db: Session = Depends(get_db),
):
    """
    List votes with filtering and pagination.

    ### Filters:
    - **politician_id**: Filter by politician ID
    - **bill_id**: Filter by bill ID
    - **vote_type**: Filter by vote type (YEA, NAY, PRESENT, ABSENT)
    - **chamber**: Filter by chamber (House, Senate)
    - **start_date**: Filter votes from this date onwards
    - **end_date**: Filter votes up to this date

    ### Sorting:
    - **sort_by**: Field to sort by (default: vote_date)
    - **sort_order**: Sort direction (asc/desc, default: desc)
    """
    # Build filter object
    filters = VoteFilter(
        politician_id=politician_id,
        bill_id=bill_id,
        vote_type=vote_type,
        chamber=chamber,
        start_date=start_date,
        end_date=end_date,
    )

    # Build query
    query, count_query = build_vote_query(db, filters)

    # Get total count
    total = count_query.scalar()

    # Apply sorting
    valid_sort_fields = ["vote_date", "politician_id", "bill_id", "roll_call_number"]
    if sort_by not in valid_sort_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sort field. Must be one of: {', '.join(valid_sort_fields)}",
        )

    sort_column = getattr(Vote, sort_by)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    # Apply pagination
    offset = (page - 1) * page_size
    votes = query.offset(offset).limit(page_size).all()

    # Get politician names for each vote
    politician_ids = list(set(v.politician_id for v in votes))
    politicians = db.query(Politician).filter(Politician.id.in_(politician_ids)).all()
    politician_map = {p.id: p.full_name for p in politicians}

    # Calculate total pages
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    # Calculate summary
    summary = get_vote_summary(votes)

    return VoteListResponse(
        votes=[
            VoteResponse(
                id=v.id,
                politician_id=v.politician_id,
                politician_name=politician_map.get(v.politician_id, "Unknown"),
                vote_type=v.vote_type,
                vote_date=v.vote_date,
                roll_call_number=v.roll_call_number,
                vote_description=v.vote_description,
            )
            for v in votes
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        summary=summary,
    )


@router.get(
    "/{vote_id}",
    response_model=VoteDetailResponse,
    summary="Get vote by ID",
    description="Retrieve detailed information about a specific vote",
    responses={
        200: {"description": "Successfully retrieved vote details"},
        404: {"description": "Vote not found"},
    },
)
async def get_vote(
    vote_id: int,
    db: Session = Depends(get_db),
):
    """
    Get detailed information about a specific vote.

    Includes:
    - Vote details (type, date, chamber)
    - Politician information
    - Bill information (if applicable)
    - Source attribution
    """
    # Fetch vote with joins
    vote = (
        db.query(Vote)
        .join(Politician, Vote.politician_id == Politician.id, isouter=True)
        .join(Bill, Vote.bill_id == Bill.id, isouter=True)
        .filter(Vote.id == vote_id)
        .first()
    )

    if not vote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vote with ID {vote_id} not found",
        )

    # Get politician name
    politician = (
        db.query(Politician).filter(Politician.id == vote.politician_id).first()
    )
    politician_name = politician.full_name if politician else "Unknown"
    politician_party = politician.party if politician else None

    # Get bill information if applicable
    bill_number = None
    bill_title = None
    if vote.bill_id:
        bill = db.query(Bill).filter(Bill.id == vote.bill_id).first()
        if bill:
            bill_number = bill.bill_number
            bill_title = bill.title

    return VoteDetailResponse(
        id=vote.id,
        politician_id=vote.politician_id,
        politician_name=politician_name,
        politician_party=politician_party,
        bill_id=vote.bill_id,
        bill_number=bill_number,
        bill_title=bill_title,
        vote_type=vote.vote_type,
        vote_date=vote.vote_date,
        chamber=vote.chamber,
        session_number=vote.session_number,
        roll_call_number=vote.roll_call_number,
        public_record=vote.public_record,
        vote_description=vote.vote_description,
        source_url=vote.source_url,
        created_at=vote.created_at,
    )


@router.post(
    "/",
    response_model=VoteDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new vote record",
    description="Add a new vote record to the database",
    responses={
        201: {"description": "Vote created successfully"},
        400: {"description": "Validation error"},
        404: {"description": "Politician not found"},
    },
)
async def create_vote(
    vote_data: VoteCreate,
    db: Session = Depends(get_db),
):
    """
    Create a new vote record.

    This endpoint is typically used during data import or by administrators.
    Requires proper authentication in production.
    """
    # Verify politician exists
    politician = (
        db.query(Politician).filter(Politician.id == vote_data.politician_id).first()
    )
    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician with ID {vote_data.politician_id} not found",
        )

    # Validate vote type
    valid_vote_types = ["YEA", "NAY", "PRESENT", "ABSENT"]
    if vote_data.vote_type.upper() not in valid_vote_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid vote type. Must be one of: {', '.join(valid_vote_types)}",
        )

    # Create vote object
    vote = Vote(
        politician_id=vote_data.politician_id,
        bill_id=vote_data.bill_id,
        vote_type=vote_data.vote_type.upper(),
        vote_date=vote_data.vote_date,
        chamber=vote_data.chamber,
        roll_call_number=vote_data.roll_call_number,
        vote_description=vote_data.vote_description,
        source_url=vote_data.source_url,
        public_record=True,
    )

    db.add(vote)
    db.commit()
    db.refresh(vote)

    return await get_vote(vote.id, db)


@router.put(
    "/{vote_id}",
    response_model=VoteDetailResponse,
    summary="Update vote record",
    description="Update an existing vote record",
    responses={
        200: {"description": "Vote updated successfully"},
        404: {"description": "Vote not found"},
        400: {"description": "Validation error"},
    },
)
async def update_vote(
    vote_id: int,
    vote_data: VoteUpdate,
    db: Session = Depends(get_db),
):
    """
    Update a vote record.

    Only provided fields will be updated. Other fields remain unchanged.
    """
    vote = db.query(Vote).filter(Vote.id == vote_id).first()

    if not vote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vote with ID {vote_id} not found",
        )

    # Validate vote type if provided
    update_data = vote_data.dict(exclude_unset=True)
    if "vote_type" in update_data:
        valid_vote_types = ["YEA", "NAY", "PRESENT", "ABSENT"]
        if update_data["vote_type"].upper() not in valid_vote_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid vote type. Must be one of: {', '.join(valid_vote_types)}",
            )
        update_data["vote_type"] = update_data["vote_type"].upper()

    # Update fields if provided
    for key, value in update_data.items():
        if value is not None:
            setattr(vote, key, value)

    db.commit()
    db.refresh(vote)

    return await get_vote(vote_id, db)


@router.delete(
    "/{vote_id}",
    summary="Delete vote record",
    description="Remove a vote record from the database",
    responses={
        200: {"description": "Vote deleted successfully"},
        404: {"description": "Vote not found"},
    },
)
async def delete_vote(
    vote_id: int,
    db: Session = Depends(get_db),
):
    """
    Delete a vote record.

    ⚠️ WARNING: This is a hard delete.
    """
    vote = db.query(Vote).filter(Vote.id == vote_id).first()

    if not vote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vote with ID {vote_id} not found",
        )

    db.delete(vote)
    db.commit()

    return {"message": f"Vote {vote_id} deleted successfully"}


@router.get(
    "/politician/{politician_id}/statistics",
    response_model=VoteStatistics,
    summary="Get politician vote statistics",
    description="Calculate voting statistics for a specific politician",
)
async def get_politician_vote_statistics(
    politician_id: int,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
):
    """
    Get voting statistics for a specific politician.

    Returns:
    - Total votes cast
    - Breakdown by vote type
    - Attendance rate
    - Party alignment rate (if available)
    """
    politician = db.query(Politician).filter(Politician.id == politician_id).first()

    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician with ID {politician_id} not found",
        )

    # Build query
    query = db.query(Vote).filter(Vote.politician_id == politician_id)

    if start_date:
        query = query.filter(Vote.vote_date >= start_date)
    if end_date:
        query = query.filter(Vote.vote_date <= end_date)

    # Get votes
    votes = query.all()
    total_votes = len(votes)

    if total_votes == 0:
        return VoteStatistics(
            politician_id=politician_id,
            politician_name=politician.full_name,
            total_votes=0,
            yea_votes=0,
            nay_votes=0,
            present_votes=0,
            absent_votes=0,
            yea_percentage=0.0,
            nay_percentage=0.0,
            attendance_rate=0.0,
        )

    # Count by vote type
    yea_votes = sum(1 for v in votes if v.vote_type == "YEA")
    nay_votes = sum(1 for v in votes if v.vote_type == "NAY")
    present_votes = sum(1 for v in votes if v.vote_type == "PRESENT")
    absent_votes = sum(1 for v in votes if v.vote_type == "ABSENT")

    # Calculate percentages
    participating_votes = total_votes - absent_votes
    yea_percentage = (
        (yea_votes / participating_votes * 100) if participating_votes > 0 else 0.0
    )
    nay_percentage = (
        (nay_votes / participating_votes * 100) if participating_votes > 0 else 0.0
    )

    # Calculate attendance rate (votes cast / total votes expected)
    # This is simplified - in production you'd compare against actual roll call count
    attendance_rate = (
        ((total_votes - absent_votes) / total_votes * 100) if total_votes > 0 else 0.0
    )

    return VoteStatistics(
        politician_id=politician_id,
        politician_name=politician.full_name,
        total_votes=total_votes,
        yea_votes=yea_votes,
        nay_votes=nay_votes,
        present_votes=present_votes,
        absent_votes=absent_votes,
        yea_percentage=round(yea_percentage, 2),
        nay_percentage=round(nay_percentage, 2),
        attendance_rate=round(attendance_rate, 2),
    )


@router.get(
    "/bill/{bill_id}/results",
    summary="Get bill vote results",
    description="Get aggregated vote results for a specific bill",
)
async def get_bill_vote_results(
    bill_id: int,
    db: Session = Depends(get_db),
):
    """
    Get vote results for a specific bill.

    Returns:
    - Aggregate vote counts
    - Breakdown by party
    - Individual votes
    """
    bill = db.query(Bill).filter(Bill.id == bill_id).first()

    if not bill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bill with ID {bill_id} not found",
        )

    # Get all votes for this bill
    votes = db.query(Vote).join(Politician).filter(Vote.bill_id == bill_id).all()

    if not votes:
        return {
            "bill_id": bill_id,
            "bill_number": bill.bill_number,
            "bill_title": bill.title,
            "total_votes": 0,
            "message": "No votes recorded for this bill",
        }

    # Count votes
    yea_votes = sum(1 for v in votes if v.vote_type == "YEA")
    nay_votes = sum(1 for v in votes if v.vote_type == "NAY")
    present_votes = sum(1 for v in votes if v.vote_type == "PRESENT")
    absent_votes = sum(1 for v in votes if v.vote_type == "ABSENT")

    # Breakdown by party
    party_breakdown = {}
    for vote in votes:
        party = vote.politician.party or "Independent"
        if party not in party_breakdown:
            party_breakdown[party] = {"yea": 0, "nay": 0, "present": 0, "absent": 0}
        party_breakdown[party][vote.vote_type.lower()] += 1

    # Check if bill passed
    total_participating = yea_votes + nay_votes
    passed = yea_votes > nay_votes if total_participating > 0 else None

    return {
        "bill_id": bill_id,
        "bill_number": bill.bill_number,
        "bill_title": bill.title,
        "total_votes": len(votes),
        "summary": {
            "yea": yea_votes,
            "nay": nay_votes,
            "present": present_votes,
            "absent": absent_votes,
        },
        "passed": passed,
        "party_breakdown": party_breakdown,
    }


@router.get(
    "/analysis/date-range",
    response_model=VoteAnalysisResponse,
    summary="Analyze voting patterns",
    description="Analyze voting patterns over a date range",
)
async def analyze_voting_patterns(
    start_date: datetime = Query(..., description="Start date for analysis"),
    end_date: datetime = Query(..., description="End date for analysis"),
    party_filter: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Analyze voting patterns over a date range.

    Returns:
    - Vote statistics by politician
    - Party breakdowns
    - Temporal patterns
    """
    # Query politicians (with optional party filter)
    query = db.query(Politician)
    if party_filter:
        query = query.filter(Politician.party.ilike(f"%{party_filter}%"))

    politicians = query.all()

    if not politicians:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No politicians found for the specified criteria",
        )

    # Analyze each politician's votes
    politician_votes = []
    party_breakdown = {}
    bill_votes = []

    for politician in politicians:
        # Get vote statistics
        stats = await get_politician_vote_statistics(
            politician_id=politician.id,
            start_date=start_date,
            end_date=end_date,
            db=db,
        )
        politician_votes.append(stats)

        # Aggregate party breakdown
        party = politician.party or "Independent"
        if party not in party_breakdown:
            party_breakdown[party] = {"yea": 0, "nay": 0, "present": 0, "total": 0}

        party_breakdown[party]["yea"] += stats.yea_votes
        party_breakdown[party]["nay"] += stats.nay_votes
        party_breakdown[party]["present"] += stats.present_votes
        party_breakdown[party]["total"] += stats.total_votes

    # Get unique bills voted on
    votes = (
        db.query(Vote)
        .filter(
            and_(
                Vote.vote_date >= start_date,
                Vote.vote_date <= end_date,
                Vote.bill_id.isnot(None),
            )
        )
        .all()
    )

    bill_ids = list(set(v.bill_id for v in votes if v.bill_id))
    for bill_id in bill_ids[:10]:  # Limit to 10 bills for performance
        result = await get_bill_vote_results(bill_id, db)
        bill_votes.append(result)

    return VoteAnalysisResponse(
        date_range={
            "start": start_date,
            "end": end_date,
        },
        politician_votes=politician_votes,
        bill_votes=bill_votes,
        party_breakdown=party_breakdown,
        temporal_patterns={
            "total_votes": sum(pv.total_votes for pv in politician_votes),
            "average_attendance": sum(pv.attendance_rate for pv in politician_votes)
            / len(politician_votes)
            if politician_votes
            else 0,
        },
    )

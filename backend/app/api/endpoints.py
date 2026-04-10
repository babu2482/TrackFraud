"""
The Glass House - API Endpoints

Comprehensive REST API endpoints for the government transparency platform.
Includes endpoints for politicians, promises, actions, comparisons, and analytics.
"""

from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from app.ai.claim_detector import ClaimDetector
from app.analytics.scoring import TransparencyScore as TransparencyScoreModel
from app.db.database import get_db
from app.db.models import (
    Action,
    Bill,
    BillSponsor,
    CabinetMember,
    FactCheck,
    Politician,
    PoliticianClaim,
    PoliticianSentiment,
    Prediction,
    President,
    PresidentialAction,
    Promise,
    PromiseStatus,
    TransparencyScore,
    Vote,
    VoteResult,
)
from app.services.congress_service import CongressGovService
from app.services.federal_register_service import FederalRegisterService
from app.services.propublica_service import ProPublicaService
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

# Create main router
router = APIRouter()

# Create sub-routers for organization
presidents_router = APIRouter(prefix="/presidents", tags=["presidents"])
politicians_router = APIRouter(prefix="/politicians", tags=["politicians"])
promises_router = APIRouter(prefix="/promises", tags=["promises"])
bills_router = APIRouter(prefix="/bills", tags=["bills"])
search_router = APIRouter(prefix="/search", tags=["search"])
analytics_router = APIRouter(prefix="/analytics", tags=["analytics"])
compare_router = APIRouter(prefix="/compare", tags=["compare"])

# Include sub-routers
router.include_router(presidents_router)
router.include_router(politicians_router)
router.include_router(promises_router)
router.include_router(bills_router)
router.include_router(search_router)
router.include_router(analytics_router)
router.include_router(compare_router)


# =====================================================
# PRESIDENTS ENDPOINTS
# =====================================================


@presidents_router.get("", response_model=List[dict])
async def get_presidents(
    party: Optional[str] = None,
    current_only: bool = False,
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Get list of all presidents with optional filtering"""
    query = db.query(President)

    if party:
        query = query.filter(President.party == party)

    if current_only:
        query = query.filter(President.term_end.is_(None))

    presidents = query.order_by(President.term_start.desc()).limit(limit).all()

    return [
        {
            "id": p.id,
            "name": p.name,
            "party": p.party,
            "term_start": p.term_start.isoformat(),
            "term_end": p.term_end.isoformat() if p.term_end else None,
            "vice_president": p.vice_president,
            "years_in_office": p.years_in_office,
            "bio": p.bio,
        }
        for p in presidents
    ]


@presidents_router.get("/{president_id}", response_model=dict)
async def get_president(president_id: int, db: Session = Depends(get_db)):
    """Get detailed information for a specific president"""
    president = db.query(President).filter(President.id == president_id).first()
    if not president:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="President not found"
        )

    # Get action statistics
    total_actions = (
        db.query(PresidentialAction)
        .filter(PresidentialAction.president_id == president_id)
        .count()
    )

    # Get cabinet size
    cabinet_size = (
        db.query(CabinetMember)
        .filter(CabinetMember.president_id == president_id)
        .count()
    )

    return {
        "id": president.id,
        "name": president.name,
        "party": president.party,
        "term_start": president.term_start.isoformat(),
        "term_end": president.term_end.isoformat() if president.term_end else None,
        "vice_president": president.vice_president,
        "bio": president.bio,
        "years_in_office": president.years_in_office,
        "total_actions": total_actions,
        "cabinet_size": cabinet_size,
    }


@presidents_router.get("/{president_id}/actions", response_model=List[dict])
async def get_president_actions(
    president_id: int,
    action_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Get actions for a specific president with filtering and pagination"""
    president = db.query(President).filter(President.id == president_id).first()
    if not president:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="President not found"
        )

    query = db.query(PresidentialAction).filter(
        PresidentialAction.president_id == president_id
    )

    if action_type:
        query = query.filter(PresidentialAction.action_type == action_type)
    if start_date:
        query = query.filter(PresidentialAction.date >= start_date)
    if end_date:
        query = query.filter(PresidentialAction.date <= end_date)

    total = query.count()
    actions = (
        query.order_by(PresidentialAction.date.desc()).offset(offset).limit(limit).all()
    )

    return {
        "actions": [
            {
                "id": a.id,
                "action_type": a.action_type,
                "title": a.title,
                "description": a.description,
                "date": a.date.isoformat(),
                "source_url": a.source_url,
                "source_id": a.source_id,
            }
            for a in actions
        ],
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + limit < total,
        },
    }


@presidents_router.get("/{president_id}/cabinet", response_model=dict)
async def get_president_cabinet(president_id: int, db: Session = Depends(get_db)):
    """Get cabinet members for a specific president"""
    president = db.query(President).filter(President.id == president_id).first()
    if not president:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="President not found"
        )

    cabinet = (
        db.query(CabinetMember)
        .filter(CabinetMember.president_id == president_id)
        .order_by(CabinetMember.start_date)
        .all()
    )

    return {
        "president_id": president_id,
        "president_name": president.name,
        "cabinet_members": [
            {
                "id": c.id,
                "position": c.position,
                "name": f"{c.first_name} {c.last_name}",
                "first_name": c.first_name,
                "last_name": c.last_name,
                "start_date": c.start_date.isoformat() if c.start_date else None,
                "end_date": c.end_date.isoformat() if c.end_date else None,
                "confirmed": c.confirmed,
                "confirmation_date": (
                    c.confirmation_date.isoformat() if c.confirmation_date else None
                ),
                "prior_position": c.prior_position,
                "bio": c.bio,
            }
            for c in cabinet
        ],
        "total_members": len(cabinet),
    }


@presidents_router.get("/{president_id}/stats", response_model=dict)
async def get_president_stats(president_id: int, db: Session = Depends(get_db)):
    """Get comprehensive statistics for a president"""
    president = db.query(President).filter(President.id == president_id).first()
    if not president:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="President not found"
        )

    # Action counts by type
    actions_by_type = (
        db.query(
            PresidentialAction.action_type,
            func.count(PresidentialAction.id).label("count"),
        )
        .filter(PresidentialAction.president_id == president_id)
        .group_by(PresidentialAction.action_type)
        .all()
    )

    # Action timeline (by year)
    actions_by_year = (
        db.query(
            func.strftime("%Y", PresidentialAction.date).label("year"),
            func.count(PresidentialAction.id).label("count"),
        )
        .filter(PresidentialAction.president_id == president_id)
        .group_by("year")
        .order_by("year")
        .all()
    )

    return {
        "president_id": president_id,
        "president_name": president.name,
        "total_actions": db.query(PresidentialAction)
        .filter(PresidentialAction.president_id == president_id)
        .count(),
        "actions_by_type": {a.action_type: a.count for a in actions_by_type},
        "actions_by_year": {a.year: a.count for a in actions_by_year},
        "cabinet_size": db.query(CabinetMember)
        .filter(CabinetMember.president_id == president_id)
        .count(),
        "years_in_office": president.years_in_office,
    }


# =====================================================
# POLITICIANS ENDPOINTS
# =====================================================


@politicians_router.get("", response_model=dict)
async def get_politicians(
    office_type: Optional[str] = None,
    state: Optional[str] = None,
    party: Optional[str] = None,
    current_only: bool = False,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Get list of politicians with filtering"""
    query = db.query(Politician)

    if office_type:
        query = query.filter(Politician.office_type == office_type)
    if state:
        query = query.filter(Politician.state == state)
    if party:
        query = query.filter(Politician.party == party)
    if current_only:
        query = query.filter(Politician.end_date.is_(None))

    total = query.count()
    politicians = query.order_by(Politician.last_name).offset(offset).limit(limit).all()

    return {
        "politicians": [
            {
                "id": p.id,
                "politician_id": p.politician_id,
                "first_name": p.first_name,
                "last_name": p.last_name,
                "full_name": f"{p.first_name} {p.last_name}",
                "party": p.party,
                "office_type": p.office_type,
                "state": p.state,
                "district": p.district,
                "start_date": p.start_date.isoformat() if p.start_date else None,
                "end_date": p.end_date.isoformat() if p.end_date else None,
                "is_current": p.end_date is None,
                "bio": p.bio,
            }
            for p in politicians
        ],
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + limit < total,
        },
    }


@politicians_router.get("/{politician_id}", response_model=dict)
async def get_politician(
    politician_id: str,
    include_transparency: bool = True,
    include_recent_actions: bool = True,
    db: Session = Depends(get_db),
):
    """Get detailed information for a specific politician"""
    politician = (
        db.query(Politician).filter(Politician.politician_id == politician_id).first()
    )
    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Politician not found"
        )

    result = {
        "id": politician.id,
        "politician_id": politician.politician_id,
        "first_name": politician.first_name,
        "last_name": politician.last_name,
        "full_name": politician.name,
        "party": politician.party,
        "office_type": politician.office_type,
        "state": politician.state,
        "district": politician.district,
        "start_date": politician.start_date.isoformat()
        if politician.start_date
        else None,
        "end_date": politician.end_date.isoformat() if politician.end_date else None,
        "is_current": politician.end_date is None,
        "bio": politician.bio,
        "twitter_handle": politician.twitter_handle,
        "website": politician.website,
        "photo_url": politician.photo_url,
        "votes_count": db.query(Vote)
        .filter(Vote.politician_id == politician_id)
        .count(),
        "promises_count": db.query(Promise)
        .filter(Promise.politician_id == politician_id)
        .count(),
    }

    if include_transparency:
        latest_score = (
            db.query(TransparencyScore)
            .filter(TransparencyScore.politician_id == politician_id)
            .order_by(TransparencyScore.score_date.desc())
            .first()
        )
        if latest_score:
            result["transparency_score"] = {
                "score": latest_score.overall_score,
                "letter_grade": latest_score.letter_grade,
                "star_rating": latest_score.star_rating,
                "trend": latest_score.trend,
                "score_date": latest_score.score_date.isoformat(),
            }

    if include_recent_actions:
        recent_actions = (
            db.query(Action)
            .filter(Action.politician_id == politician_id)
            .order_by(Action.action_date.desc())
            .limit(10)
            .all()
        )
        result["recent_actions"] = [
            {
                "id": a.id,
                "action_type": a.action_type,
                "title": a.title,
                "description": a.description[:200] + "..."
                if len(a.description) > 200
                else a.description,
                "action_date": a.action_date.isoformat(),
                "source_url": a.source_url,
            }
            for a in recent_actions
        ]

    return result


@politicians_router.get("/{politician_id}/actions", response_model=dict)
async def get_politician_actions(
    politician_id: str,
    action_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Get actions for a specific politician"""
    politician = (
        db.query(Politician).filter(Politician.politician_id == politician_id).first()
    )
    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Politician not found"
        )

    query = db.query(Action).filter(Action.politician_id == politician_id)

    if action_type:
        query = query.filter(Action.action_type == action_type)
    if start_date:
        query = query.filter(Action.action_date >= start_date)
    if end_date:
        query = query.filter(Action.action_date <= end_date)

    total = query.count()
    actions = (
        query.order_by(Action.action_date.desc()).offset(offset).limit(limit).all()
    )

    return {
        "politician_id": politician_id,
        "politician_name": politician.name,
        "actions": [
            {
                "id": a.id,
                "action_type": a.action_type,
                "category": a.category,
                "title": a.title,
                "description": a.description,
                "action_date": a.action_date.isoformat(),
                "source_url": a.source_url,
                "external_id": a.external_id,
            }
            for a in actions
        ],
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + limit < total,
        },
    }


@politicians_router.get("/{politician_id}/votes", response_model=dict)
async def get_politician_votes(
    politician_id: str,
    bill_type: Optional[str] = None,
    vote_result: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Get voting record for a specific politician"""
    politician = (
        db.query(Politician).filter(Politician.politician_id == politician_id).first()
    )
    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Politician not found"
        )

    query = db.query(Vote).filter(Vote.politician_id == politician_id)

    if bill_type:
        vote_query = (
            db.query(Bill)
            .join(BillSponsor, Bill.id == BillSponsor.bill_id)
            .filter(
                BillSponsor.member_id == politician.id,
                Bill.bill_type == bill_type,
            )
        )
    if vote_result:
        query = query.filter(Vote.vote_result == vote_result)

    total = query.count()
    votes = query.order_by(Vote.vote_date.desc()).offset(offset).limit(limit).all()

    # Get voting statistics
    total_votes = db.query(Vote).filter(Vote.politician_id == politician_id).count()
    yeas = (
        db.query(Vote)
        .filter(Vote.politician_id == politician_id, Vote.vote_result == "YEA")
        .count()
    )
    nays = (
        db.query(Vote)
        .filter(Vote.politician_id == politician_id, Vote.vote_result == "NAY")
        .count()
    )
    present = (
        db.query(Vote)
        .filter(Vote.politician_id == politician_id, Vote.vote_result == "PRESENT")
        .count()
    )
    absent = (
        db.query(Vote)
        .filter(Vote.politician_id == politician_id, Vote.vote_result == "ABSENT")
        .count()
    )

    return {
        "politician_id": politician_id,
        "politician_name": politician.name,
        "voting_record": [
            {
                "id": v.id,
                "bill_number": v.bill_number,
                "bill_title": v.bill_title,
                "vote_date": v.vote_date.isoformat(),
                "vote_result": v.vote_result,
                "vote_type": v.vote_type,
                "source_url": v.source_url,
            }
            for v in votes
        ],
        "statistics": {
            "total_votes": total_votes,
            "yeas": yeas,
            "nays": nays,
            "present": present,
            "absent": absent,
            "yea_percentage": round((yeas / total_votes * 100), 2)
            if total_votes > 0
            else 0,
            "nay_percentage": round((nays / total_votes * 100), 2)
            if total_votes > 0
            else 0,
        },
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + limit < total,
        },
    }


# =====================================================
# PROMISES ENDPOINTS (Actions vs Words Engine)
# =====================================================


@promises_router.get("", response_model=dict)
async def get_promises(
    politician_id: Optional[str] = None,
    status: Optional[str] = None,
    topic: Optional[str] = None,
    include_text_search: bool = False,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Get promises with filtering - CORE ACTIONS VS WORDS FEATURE"""
    query = db.query(Promise)

    if politician_id:
        query = query.filter(Promise.politician_id == politician_id)
    if status:
        query = query.filter(Promise.status == status)
    if topic:
        query = query.filter(Promise.topic == topic)

    total = query.count()
    promises = (
        query.order_by(Promise.promise_date.desc()).offset(offset).limit(limit).all()
    )

    return {
        "promises": [
            {
                "id": p.id,
                "politician_id": p.politician_id,
                "politician_name": p.politician_name,
                "promise_text": p.promise_text,
                "topic": p.topic,
                "status": p.status,
                "promise_date": p.promise_date.isoformat(),
                "deadline_date": p.deadline_date.isoformat()
                if p.deadline_date
                else None,
                "context": p.context,
                "source_url": p.source_url,
                "fulfillment_percentage": p.fulfillment_percentage,
                "is_past_deadline": p.is_past_deadline,
            }
            for p in promises
        ],
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + limit < total,
        },
    }


@promises_router.get("/unfulfilled", response_model=dict)
async def get_unfulfilled_promises(
    politician_id: Optional[str] = None,
    days_overdue: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Get unfulfilled or overdue promises - KEY ACTIONS VS WORDS FEATURE"""
    query = db.query(Promise).filter(
        Promise.status.in_([PromiseStatus.PENDING, PromiseStatus.PARTIALLY_FULFILLED])
    )

    if politician_id:
        query = query.filter(Promise.politician_id == politician_id)

    if days_overdue > 0:
        from datetime import timedelta

        overdue_date = datetime.now() - timedelta(days=days_overdue)
        query = query.filter(
            Promise.deadline_date.isnot(None), Promise.deadline_date < overdue_date
        )

    promises = query.order_by(Promise.deadline_date.asc()).limit(limit).all()

    return {
        "unfulfilled_promises": [
            {
                "id": p.id,
                "politician_id": p.politician_id,
                "politician_name": p.politician_name,
                "promise_text": p.promise_text,
                "topic": p.topic,
                "status": p.status.value,
                "promise_date": p.promise_date.isoformat(),
                "deadline_date": p.deadline_date.isoformat()
                if p.deadline_date
                else None,
                "days_overdue": (
                    (datetime.now() - p.deadline_date).days
                    if p.deadline_date and p.deadline_date < datetime.now()
                    else 0
                ),
                "fulfillment_percentage": p.fulfillment_percentage,
                "source_url": p.source_url,
            }
            for p in promises
        ],
        "total_unfulfilled": len(promises),
    }


@promises_router.get("/{promise_id}", response_model=dict)
async def get_promise(promise_id: int, db: Session = Depends(get_db)):
    """Get detailed information for a specific promise"""
    promise = db.query(Promise).filter(Promise.id == promise_id).first()
    if not promise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Promise not found"
        )

    # Get related evidence
    # This would query an Evidence table if it exists

    # Get promise updates
    # This would query a PromiseUpdate table

    return {
        "id": promise.id,
        "politician_id": promise.politician_id,
        "politician_name": promise.politician_name,
        "promise_text": promise.promise_text,
        "topic": promise.topic,
        "status": promise.status.value,
        "promise_date": promise.promise_date.isoformat(),
        "deadline_date": promise.deadline_date.isoformat()
        if promise.deadline_date
        else None,
        "context": promise.context,
        "source_url": promise.source_url,
        "external_id": promise.external_id,
        "evidence_url": promise.evidence_url,
        "fulfillment_percentage": promise.fulfillment_percentage,
        "is_past_deadline": promise.is_past_deadline,
        "days_until_deadline": (
            (promise.deadline_date - datetime.now()).days
            if promise.deadline_date and promise.deadline_date > datetime.now()
            else None
        ),
        "created_at": promise.created_at.isoformat() if promise.created_at else None,
        "updated_at": promise.updated_at.isoformat() if promise.updated_at else None,
    }


@promises_router.get("/politician/{politician_id}/summary", response_model=dict)
async def get_politician_promise_summary(
    politician_id: str, db: Session = Depends(get_db)
):
    """Get promise fulfillment summary for a politician"""
    politician = (
        db.query(Politician).filter(Politician.politician_id == politician_id).first()
    )
    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Politician not found"
        )

    # Get promise statistics
    total_promises = (
        db.query(Promise).filter(Promise.politician_id == politician_id).count()
    )

    fulfilled = (
        db.query(Promise)
        .filter(
            Promise.politician_id == politician_id,
            Promise.status == PromiseStatus.FULFILLED,
        )
        .count()
    )

    partially_fulfilled = (
        db.query(Promise)
        .filter(
            Promise.politician_id == politician_id,
            Promise.status == PromiseStatus.PARTIALLY_FULFILLED,
        )
        .count()
    )

    pending = (
        db.query(Promise)
        .filter(
            Promise.politician_id == politician_id,
            Promise.status == PromiseStatus.PENDING,
        )
        .count()
    )

    broken = (
        db.query(Promise)
        .filter(
            Promise.politician_id == politician_id,
            Promise.status == PromiseStatus.BROKEN,
        )
        .count()
    )

    overdue = (
        db.query(Promise)
        .filter(
            Promise.politician_id == politician_id,
            Promise.deadline_date.isnot(None),
            Promise.deadline_date < datetime.now(),
            Promise.status.in_(
                [PromiseStatus.PENDING, PromiseStatus.PARTIALLY_FULFILLED]
            ),
        )
        .count()
    )

    # Calculate fulfillment rate
    fulfillment_rate = (
        round((fulfilled / total_promises * 100), 2) if total_promises > 0 else 0
    )

    # Get promises by topic
    promises_by_topic = (
        db.query(
            Promise.topic,
            func.count(Promise.id).label("count"),
        )
        .filter(Promise.politician_id == politician_id)
        .group_by(Promise.topic)
        .all()
    )

    return {
        "politician_id": politician_id,
        "politician_name": politician.name,
        "total_promises": total_promises,
        "fulfilled_promises": fulfilled,
        "partially_fulfilled": partially_fulfilled,
        "pending_promises": pending,
        "broken_promises": broken,
        "overdue_promises": overdue,
        "fulfillment_rate": fulfillment_rate,
        "promises_by_topic": {t.topic: t.count for t in promises_by_topic},
    }


# =====================================================
# BILLS ENDPOINTS
# =====================================================


@bills_router.get("", response_model=dict)
async def get_bills(
    congress_number: Optional[int] = None,
    bill_type: Optional[str] = None,
    status: Optional[str] = None,
    sponsor_id: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Get bills with filtering"""
    query = db.query(Bill)

    if congress_number:
        query = query.filter(Bill.congress_number == congress_number)
    if bill_type:
        query = query.filter(Bill.bill_type == bill_type)
    if status:
        query = query.filter(Bill.status == status)

    total = query.count()
    bills = (
        query.order_by(Bill.introduced_date.desc()).offset(offset).limit(limit).all()
    )

    return {
        "bills": [
            {
                "id": b.id,
                "congress_number": b.congress_number,
                "bill_number": b.bill_number,
                "bill_type": b.bill_type,
                "title": b.title,
                "summary": b.summary,
                "introduced_date": b.introduced_date.isoformat()
                if b.introduced_date
                else None,
                "status": b.status,
                "source_url": b.source_url,
                "external_id": b.external_id,
            }
            for b in bills
        ],
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + limit < total,
        },
    }


@bills_router.get("/{bill_id}", response_model=dict)
async def get_bill(bill_id: int, db: Session = Depends(get_db)):
    """Get detailed information for a specific bill"""
    bill = db.query(Bill).filter(Bill.id == bill_id).first()
    if not bill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found"
        )

    # Get sponsors
    sponsors = db.query(BillSponsor).filter(BillSponsor.bill_id == bill_id).all()

    # Get votes
    votes = db.query(VoteResult).filter(VoteResult.bill_id == bill_id).all()

    return {
        "id": bill.id,
        "congress_number": bill.congress_number,
        "bill_number": bill.bill_number,
        "bill_type": bill.bill_type,
        "title": bill.title,
        "summary": bill.summary,
        "introduced_date": bill.introduced_date.isoformat()
        if bill.introduced_date
        else None,
        "status": bill.status,
        "source_url": bill.source_url,
        "external_id": bill.external_id,
        "sponsors": [
            {
                "member_id": s.member_id,
                "first_name": s.first_name,
                "last_name": s.last_name,
                "party": s.party,
                "state": s.state,
                "is_primary": s.is_primary,
            }
            for s in sponsors
        ],
        "votes": [
            {
                "vote_type": v.vote_type,
                "vote_date": v.vote_date.isoformat() if v.vote_date else None,
                "result": v.result,
                "yeas": v.yeas,
                "nays": v.nays,
            }
            for v in votes
        ],
    }


# =====================================================
# SEARCH ENDPOINTS
# =====================================================


@search_router.get("", response_model=dict)
async def search_all(
    q: str = Query(..., description="Search query"),
    type: Optional[str] = None,  # politician, bill, promise, action
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Global search across all entities"""
    results = {
        "politicians": [],
        "bills": [],
        "promises": [],
        "presidents": [],
    }

    # Search politicians
    if not type or type == "politician":
        politicians = (
            db.query(Politician)
            .filter(
                Politician.first_name.ilike(f"%{q}%")
                | Politician.last_name.ilike(f"%{q}%")
                | Politician.bio.ilike(f"%{q}%")
            )
            .limit(limit // 4)
            .all()
        )
        results["politicians"] = [
            {
                "id": p.id,
                "politician_id": p.politician_id,
                "name": p.name,
                "party": p.party,
                "office_type": p.office_type,
                "state": p.state,
                "type": "politician",
            }
            for p in politicians
        ]

    # Search presidents
    if not type or type == "president":
        presidents = (
            db.query(President)
            .filter(President.name.ilike(f"%{q}%") | President.bio.ilike(f"%{q}%"))
            .limit(limit // 4)
            .all()
        )
        results["presidents"] = [
            {
                "id": p.id,
                "name": p.name,
                "party": p.party,
                "type": "president",
            }
            for p in presidents
        ]

    # Search bills
    if not type or type == "bill":
        bills = (
            db.query(Bill)
            .filter(
                Bill.title.ilike(f"%{q}%")
                | Bill.summary.ilike(f"%{q}%")
                | Bill.bill_number.ilike(f"%{q}%")
            )
            .limit(limit // 4)
            .all()
        )
        results["bills"] = [
            {
                "id": b.id,
                "bill_number": b.bill_number,
                "title": b.title,
                "status": b.status,
                "type": "bill",
            }
            for b in bills
        ]

    # Search promises
    if not type or type == "promise":
        promises = (
            db.query(Promise)
            .filter(
                Promise.promise_text.ilike(f"%{q}%") | Promise.topic.ilike(f"%{q}%")
            )
            .limit(limit // 4)
            .all()
        )
        results["promises"] = [
            {
                "id": p.id,
                "politician_name": p.politician_name,
                "promise_text": p.promise_text[:200],
                "status": p.status.value,
                "type": "promise",
            }
            for p in promises
        ]

    # Combine and sort by relevance (simplified)
    all_results = []
    for category, items in results.items():
        all_results.extend(items)

    return {
        "query": q,
        "total_results": len(all_results),
        "results_by_type": results,
        "results": all_results,
    }


@search_router.get("/politicians", response_model=dict)
async def search_politicians(
    q: str = Query(..., description="Search query"),
    party: Optional[str] = None,
    state: Optional[str] = None,
    office_type: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Search specifically for politicians"""
    query = db.query(Politician).filter(
        Politician.first_name.ilike(f"%{q}%")
        | Politician.last_name.ilike(f"%{q}%")
        | Politician.bio.ilike(f"%{q}%")
        | Politician.twitter_handle.ilike(f"%{q}%")
    )

    if party:
        query = query.filter(Politician.party == party)
    if state:
        query = query.filter(Politician.state == state)
    if office_type:
        query = query.filter(Politician.office_type == office_type)

    politicians = query.limit(limit).all()

    return {
        "query": q,
        "politicians": [
            {
                "id": p.id,
                "politician_id": p.politician_id,
                "name": p.name,
                "party": p.party,
                "office_type": p.office_type,
                "state": p.state,
                "district": p.district,
                "is_current": p.end_date is None,
            }
            for p in politicians
        ],
        "total_results": len(politicians),
    }


# =====================================================
# ANALYTICS ENDPOINTS
# =====================================================


@analytics_router.get("/transparency/{politician_id}", response_model=dict)
async def get_transparency_score(
    politician_id: str,
    include_history: bool = True,
    db: Session = Depends(get_db),
):
    """Get transparency score for a politician"""
    politician = (
        db.query(Politician).filter(Politician.politician_id == politician_id).first()
    )
    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Politician not found"
        )

    # Get latest score
    latest_score = (
        db.query(TransparencyScore)
        .filter(TransparencyScore.politician_id == politician_id)
        .order_by(TransparencyScore.score_date.desc())
        .first()
    )

    result = {
        "politician_id": politician_id,
        "politician_name": politician.name,
        "current_score": None,
        "score_history": [],
    }

    if latest_score:
        result["current_score"] = {
            "score": latest_score.overall_score,
            "letter_grade": latest_score.letter_grade,
            "star_rating": latest_score.star_rating,
            "trend": latest_score.trend,
            "trend_magnitude": latest_score.trend_magnitude,
            "rank": latest_score.rank,
            "peer_group": latest_score.peer_group,
            "score_date": latest_score.score_date.isoformat(),
            "factor_scores": {
                "voting_record": latest_score.voting_record_score,
                "promise_fulfillment": latest_score.promise_fulfillment_score,
                "public_communication": latest_score.public_communication_score,
                "document_release": latest_score.document_release_score,
                "conflict_disclosure": latest_score.conflict_disclosure_score,
                "meeting_transparency": latest_score.meeting_transparency_score,
            },
        }

    if include_history:
        history = (
            db.query(TransparencyScore)
            .filter(TransparencyScore.politician_id == politician_id)
            .order_by(TransparencyScore.score_date.desc())
            .limit(12)
            .all()
        )
        result["score_history"] = [
            {
                "score_date": s.score_date.isoformat(),
                "overall_score": s.overall_score,
                "letter_grade": s.letter_grade,
                "trend": s.trend,
            }
            for s in history
        ]

    return result


@analytics_router.get("/sentiment/{politician_id}", response_model=dict)
async def get_politician_sentiment(
    politician_id: str,
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Get sentiment analysis for a politician over time"""
    politician = (
        db.query(Politician).filter(Politician.politician_id == politician_id).first()
    )
    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Politician not found"
        )

    sentiments = (
        db.query(PoliticianSentiment)
        .filter(PoliticianSentiment.politician_id == politician_id)
        .order_by(PoliticianSentiment.snapshot_date.desc())
        .limit(limit)
        .all()
    )

    return {
        "politician_id": politician_id,
        "politician_name": politician.name,
        "current_sentiment": (
            {
                "snapshot_date": sentiments[0].snapshot_date.isoformat(),
                "positive_score": sentiments[0].positive_score,
                "negative_score": sentiments[0].negative_score,
                "neutral_score": sentiments[0].neutral_score,
                "overall_sentiment": sentiments[0].overall_sentiment,
                "dominant_emotion": sentiments[0].dominant_emotion,
            }
            if sentiments
            else None
        ),
        "sentiment_history": [
            {
                "snapshot_date": s.snapshot_date.isoformat(),
                "positive_score": s.positive_score,
                "negative_score": s.negative_score,
                "neutral_score": s.neutral_score,
                "overall_sentiment": s.overall_sentiment,
            }
            for s in sentiments
        ],
    }


@analytics_router.get("/predictions/bills", response_model=dict)
async def get_bill_predictions(
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Get AI predictions for bill outcomes"""
    query = db.query(Prediction)

    if status:
        query = query.filter(Prediction.prediction_type == status)

    predictions = query.order_by(Prediction.created_at.desc()).limit(limit).all()

    return {
        "predictions": [
            {
                "id": p.id,
                "bill_id": p.bill_id,
                "bill_number": p.bill_number,
                "bill_title": p.bill_title,
                "prediction_type": p.prediction_type,
                "predicted_value": p.predicted_value,
                "confidence": p.confidence,
                "confidence_level": p.confidence_level,
                "explanation": p.explanation,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in predictions
        ],
        "total_predictions": len(predictions),
    }


@analytics_router.get("/top-performers", response_model=dict)
async def get_top_performers(
    metric: str = "transparency",  # transparency, fulfillment, votes
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Get top performing politicians by metric"""
    if metric == "transparency":
        scores = (
            db.query(TransparencyScore)
            .join(
                Politician, TransparencyScore.politician_id == Politician.politician_id
            )
            .order_by(TransparencyScore.overall_score.desc())
            .limit(limit)
            .all()
        )
        return {
            "metric": metric,
            "top_performers": [
                {
                    "rank": i + 1,
                    "politician_id": s.politician_id,
                    "politician_name": s.politician_name,
                    "party": s.politician_party,
                    "office_type": s.politician_office_type,
                    "state": s.politician_state,
                    "score": s.overall_score,
                    "letter_grade": s.letter_grade,
                }
                for i, s in enumerate(scores)
            ],
        }
    elif metric == "fulfillment":
        # Calculate fulfillment rates
        politician_fulfillment = (
            db.query(
                Promise.politician_id,
                Promise.politician_name,
                func.avg(Promise.fulfillment_percentage).label("avg_fulfillment"),
                func.count(Promise.id).label("total_promises"),
            )
            .group_by(Promise.politician_id, Promise.politician_name)
            .order_by("avg_fulfillment".desc())
            .limit(limit)
            .all()
        )
        return {
            "metric": metric,
            "top_performers": [
                {
                    "rank": i + 1,
                    "politician_id": p.politician_id,
                    "politician_name": p.politician_name,
                    "fulfillment_rate": round(p.avg_fulfillment, 2),
                    "total_promises": p.total_promises,
                }
                for i, p in enumerate(politician_fulfillment)
            ],
        }

    return {"error": "Unknown metric", "valid_metrics": ["transparency", "fulfillment"]}


# =====================================================
# COMPARE ENDPOINTS
# =====================================================


@compare_router.get("/presidents/{id1}/with/{id2}", response_model=dict)
async def compare_presidents(
    id1: int,
    id2: int,
    db: Session = Depends(get_db),
):
    """Compare two presidents"""
    president1 = db.query(President).filter(President.id == id1).first()
    president2 = db.query(President).filter(President.id == id2).first()

    if not president1 or not president2:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or both presidents not found",
        )

    # Get action statistics for both
    actions1 = (
        db.query(
            PresidentialAction.action_type,
            func.count(PresidentialAction.id).label("count"),
        )
        .filter(PresidentialAction.president_id == id1)
        .group_by(PresidentialAction.action_type)
        .all()
    )

    actions2 = (
        db.query(
            PresidentialAction.action_type,
            func.count(PresidentialAction.id).label("count"),
        )
        .filter(PresidentialAction.president_id == id2)
        .group_by(PresidentialAction.action_type)
        .all()
    )

    cabinet1_count = (
        db.query(CabinetMember).filter(CabinetMember.president_id == id1).count()
    )
    cabinet2_count = (
        db.query(CabinetMember).filter(CabinetMember.president_id == id2).count()
    )

    return {
        "president1": {
            "id": president1.id,
            "name": president1.name,
            "party": president1.party,
            "term_start": president1.term_start.isoformat(),
            "term_end": president1.term_end.isoformat()
            if president1.term_end
            else None,
            "years_in_office": president1.years_in_office,
            "total_actions": db.query(PresidentialAction)
            .filter(PresidentialAction.president_id == id1)
            .count(),
            "actions_by_type": {a.action_type: a.count for a in actions1},
            "cabinet_size": cabinet1_count,
        },
        "president2": {
            "id": president2.id,
            "name": president2.name,
            "party": president2.party,
            "term_start": president2.term_start.isoformat(),
            "term_end": president2.term_end.isoformat()
            if president2.term_end
            else None,
            "years_in_office": president2.years_in_office,
            "total_actions": db.query(PresidentialAction)
            .filter(PresidentialAction.president_id == id2)
            .count(),
            "actions_by_type": {a.action_type: a.count for a in actions2},
            "cabinet_size": cabinet2_count,
        },
        "comparison": {
            "action_difference": db.query(PresidentialAction)
            .filter(PresidentialAction.president_id == id1)
            .count()
            - db.query(PresidentialAction)
            .filter(PresidentialAction.president_id == id2)
            .count(),
            "cabinet_size_difference": cabinet1_count - cabinet2_count,
            "years_in_office_difference": president1.years_in_office
            - president2.years_in_office,
        },
    }


@compare_router.get("/politicians/{id1}/with/{id2}", response_model=dict)
async def compare_politicians(
    id1: str,
    id2: str,
    db: Session = Depends(get_db),
):
    """Compare two politicians"""
    politician1 = db.query(Politician).filter(Politician.politician_id == id1).first()
    politician2 = db.query(Politician).filter(Politician.politician_id == id2).first()

    if not politician1 or not politician2:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or both politicians not found",
        )

    # Get transparency scores
    score1 = (
        db.query(TransparencyScore)
        .filter(TransparencyScore.politician_id == id1)
        .order_by(TransparencyScore.score_date.desc())
        .first()
    )

    score2 = (
        db.query(TransparencyScore)
        .filter(TransparencyScore.politician_id == id2)
        .order_by(TransparencyScore.score_date.desc())
        .first()
    )

    # Get promise statistics
    promises1 = db.query(Promise).filter(Promise.politician_id == id1).all()
    promises2 = db.query(Promise).filter(Promise.politician_id == id2).all()

    fulfillment_rate1 = (
        round(sum(p.fulfillment_percentage for p in promises1) / len(promises1), 2)
        if promises1
        else 0
    )
    fulfillment_rate2 = (
        round(sum(p.fulfillment_percentage for p in promises2) / len(promises2), 2)
        if promises2
        else 0
    )

    return {
        "politician1": {
            "id": politician1.id,
            "politician_id": politician1.politician_id,
            "name": politician1.name,
            "party": politician1.party,
            "office_type": politician1.office_type,
            "state": politician1.state,
            "transparency_score": score1.overall_score if score1 else None,
            "transparency_grade": score1.letter_grade if score1 else None,
            "total_promises": len(promises1),
            "fulfillment_rate": fulfillment_rate1,
            "votes_count": db.query(Vote).filter(Vote.politician_id == id1).count(),
        },
        "politician2": {
            "id": politician2.id,
            "politician_id": politician2.politician_id,
            "name": politician2.name,
            "party": politician2.party,
            "office_type": politician2.office_type,
            "state": politician2.state,
            "transparency_score": score2.overall_score if score2 else None,
            "transparency_grade": score2.letter_grade if score2 else None,
            "total_promises": len(promises2),
            "fulfillment_rate": fulfillment_rate2,
            "votes_count": db.query(Vote).filter(Vote.politician_id == id2).count(),
        },
        "comparison": {
            "transparency_difference": (
                score1.overall_score - score2.overall_score
                if score1 and score2
                else None
            ),
            "fulfillment_difference": fulfillment_rate1 - fulfillment_rate2,
            "votes_difference": (
                db.query(Vote).filter(Vote.politician_id == id1).count()
                - db.query(Vote).filter(Vote.politician_id == id2).count()
            ),
        },
    }

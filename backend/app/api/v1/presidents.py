"""
The Glass House - Presidents API Endpoints

Endpoints for managing and querying presidential information including
profiles, actions, cabinet members, and statistics.
"""

from datetime import datetime
from typing import List, Optional

from app.db.database import get_db
from app.db.models import (
    CabinetMember,
    President,
    PresidentialAction,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/presidents", tags=["presidents"])


@router.get("", response_model=List[dict])
async def get_presidents(
    party: Optional[str] = None,
    current_only: bool = False,
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """
    Get list of all presidents with optional filtering.

    Supports filtering by party and current president only.
    """
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


@router.get("/{president_id}", response_model=dict)
async def get_president(president_id: int, db: Session = Depends(get_db)):
    """
    Get detailed information for a specific president.

    Returns president profile with action and cabinet statistics.
    """
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


@router.get("/{president_id}/actions", response_model=dict)
async def get_president_actions(
    president_id: int,
    action_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Get actions for a specific president with filtering and pagination.

    Supports filtering by action type and date range.
    """
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


@router.get("/{president_id}/cabinet", response_model=dict)
async def get_president_cabinet(president_id: int, db: Session = Depends(get_db)):
    """
    Get cabinet members for a specific president.

    Returns all cabinet members with their positions and tenure dates.
    """
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


@router.get("/{president_id}/stats", response_model=dict)
async def get_president_stats(president_id: int, db: Session = Depends(get_db)):
    """
    Get comprehensive statistics for a president.

    Returns action counts by type, timeline by year, and other metrics.
    """
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

"""
Comparisons API Endpoints for The Glass House

This module provides RESTful endpoints for comparing politicians side-by-side
across various metrics including actions, voting patterns, promise fulfillment,
and transparency scores.

Endpoints include:
- Compare two politicians comprehensively
- Compare voting patterns between politicians
- Compare promise fulfillment rates
- Compare transparency scores
- Get comparison insights and analytics

All endpoints use proper validation, error handling, and async where appropriate.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional

from app.core.config import get_settings
from app.db.database import get_db
from app.db.models import (
    Action,
    ActionType,
    Bill,
    Politician,
    Promise,
    PromiseStatus,
    TransparencyScore,
    Vote,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter()

settings = get_settings()


# ==========================================================================
# Pydantic Schemas
# ==========================================================================


class ComparisonType(str):
    """Types of comparisons available"""

    COMPREHENSIVE = "comprehensive"
    ACTIONS = "actions"
    VOTES = "votes"
    PROMISES = "promises"
    TRANSPARENCY = "transparency"
    ALL = "all"


class ComparisonBase(BaseModel):
    """Base comparison parameters"""

    politician_id_1: int
    politician_id_2: int
    comparison_type: str = "comprehensive"


class ActionComparison(BaseModel):
    """Comparison of politician actions"""

    politician_id: int
    politician_name: str
    total_actions: int
    actions_by_type: Dict[str, int]
    actions_by_category: Dict[str, int]
    actions_by_month: Dict[str, int]
    avg_impact_level: float
    recent_actions: List[Dict]


class VoteComparison(BaseModel):
    """Comparison of voting patterns"""

    politician_id: int
    politician_name: str
    party: Optional[str]
    total_votes: int
    yea_votes: int
    nay_votes: int
    present_votes: int
    absent_votes: int
    yea_percentage: float
    nay_percentage: float
    attendance_rate: float
    party_alignment_rate: Optional[float]


class PromiseComparison(BaseModel):
    """Comparison of promise fulfillment"""

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
    by_category: Dict[str, Dict]


class TransparencyComparison(BaseModel):
    """Comparison of transparency scores"""

    politician_id: int
    politician_name: str
    overall_score: float
    letter_grade: str
    star_rating: int
    voting_record_score: float
    promise_fulfillment_score: float
    public_communication_score: float
    document_release_score: float
    conflict_disclosure_score: float
    meeting_transparency_score: float
    rank: Optional[int]
    trend: str
    trend_magnitude: float


class PoliticianComparison(BaseModel):
    """Full comparison data for a single politician"""

    politician_id: int
    full_name: str
    office_title: str
    party: Optional[str]
    state: Optional[str]
    term_start: datetime
    term_end: Optional[datetime]
    years_in_office: int
    actions: ActionComparison
    votes: VoteComparison
    promises: PromiseComparison
    transparency: TransparencyComparison


class ComparisonResult(BaseModel):
    """Complete comparison result between two politicians"""

    politician_1: PoliticianComparison
    politician_2: PoliticianComparison
    comparison_metrics: Dict[str, Dict[str, any]]
    insights: List[Dict[str, any]]
    similarity_score: float
    generated_at: datetime


class ComparisonInsight(BaseModel):
    """Single comparison insight"""

    category: str
    insight_type: str  # "difference", "similarity", "trend", "notable"
    description: str
    magnitude: Optional[float] = None
    politician_1_value: Optional[any] = None
    politician_2_value: Optional[any] = None
    significance: str  # "high", "medium", "low"


# ==========================================================================
# Helper Functions
# ==========================================================================


def calculate_similarity_score(
    politician_1: Politician, politician_2: Politician
) -> float:
    """
    Calculate overall similarity score between two politicians.

    Based on:
    - Same party
    - Same chamber/office type
    - Similar voting patterns
    - Similar action types
    - Similar ideology (if available)
    """
    score = 0.0
    weights = []

    # Party alignment (30% weight)
    if politician_1.party and politician_2.party:
        if politician_1.party.lower() == politician_2.party.lower():
            score += 0.3
        weights.append(0.3)

    # Office type similarity (20% weight)
    if politician_1.office_type == politician_2.office_type:
        score += 0.2
    weights.append(0.2)

    # Jurisdiction similarity (15% weight)
    if politician_1.jurisdiction_level == politician_2.jurisdiction_level:
        score += 0.15
    weights.append(0.15)

    # State alignment (if applicable) (15% weight)
    if politician_1.state and politician_2.state:
        if politician_1.state == politician_2.state:
            score += 0.15
        weights.append(0.15)

    # Term overlap (10% weight)
    if politician_1.term_start and politician_2.term_start:
        p1_end = politician_1.term_end or datetime.utcnow()
        p2_end = politician_2.term_end or datetime.utcnow()

        # Calculate overlap period
        overlap_start = max(politician_1.term_start, politician_2.term_start)
        overlap_end = min(p1_end, p2_end)

        if overlap_start < overlap_end:
            overlap_days = (overlap_end - overlap_start).days
            avg_term_length = (
                (p1_end - politician_1.term_start).days
                + (p2_end - politician_2.term_start).days
            ) / 2
            if avg_term_length > 0:
                overlap_ratio = overlap_days / avg_term_length
                score += 0.1 * min(overlap_ratio, 1.0)
        weights.append(0.1)

    # Normalize score
    if weights:
        max_possible = sum(weights)
        score = min(1.0, score / max_possible)

    return round(score, 2)


def generate_insights(
    politician_1: PoliticianComparison,
    politician_2: PoliticianComparison,
) -> List[ComparisonInsight]:
    """Generate comparison insights between two politicians"""
    insights = []

    # Action volume comparison
    action_diff = (
        politician_1.actions.total_actions - politician_2.actions.total_actions
    )
    if abs(action_diff) > 10:
        winner = "Politician 1" if action_diff > 0 else "Politician 2"
        insights.append(
            ComparisonInsight(
                category="actions",
                insight_type="difference",
                description=f"{winner} has {abs(action_diff)} more actions than the other",
                magnitude=abs(action_diff),
                politician_1_value=politician_1.actions.total_actions,
                politician_2_value=politician_2.actions.total_actions,
                significance="high" if abs(action_diff) > 50 else "medium",
            )
        )

    # Voting record comparison
    yea_diff = politician_1.votes.yea_percentage - politician_2.votes.yea_percentage
    if abs(yea_diff) > 10:
        insights.append(
            ComparisonInsight(
                category="voting",
                insight_type="difference",
                description=f"Politician 1 votes 'yea' {abs(yea_diff):.1f}% more often",
                magnitude=abs(yea_diff),
                politician_1_value=politician_1.votes.yea_percentage,
                politician_2_value=politician_2.votes.yea_percentage,
                significance="high" if abs(yea_diff) > 20 else "medium",
            )
        )

    # Promise fulfillment comparison
    fulfillment_diff = (
        politician_1.promises.fulfillment_rate - politician_2.promises.fulfillment_rate
    )
    if abs(fulfillment_diff) > 5:
        winner = "Politician 1" if fulfillment_diff > 0 else "Politician 2"
        insights.append(
            ComparisonInsight(
                category="promises",
                insight_type="difference",
                description=f"{winner} has a {abs(fulfillment_diff):.1f}% higher fulfillment rate",
                magnitude=abs(fulfillment_diff),
                politician_1_value=politician_1.promises.fulfillment_rate,
                politician_2_value=politician_2.promises.fulfillment_rate,
                significance="high" if abs(fulfillment_diff) > 15 else "medium",
            )
        )

    # Transparency score comparison
    transparency_diff = (
        politician_1.transparency.overall_score
        - politician_2.transparency.overall_score
    )
    if abs(transparency_diff) > 5:
        winner = "Politician 1" if transparency_diff > 0 else "Politician 2"
        insights.append(
            ComparisonInsight(
                category="transparency",
                insight_type="difference",
                description=f"{winner} is {abs(transparency_diff):.1f} points more transparent",
                magnitude=abs(transparency_diff),
                politician_1_value=politician_1.transparency.overall_score,
                politician_2_value=politician_2.transparency.overall_score,
                significance="high" if abs(transparency_diff) > 15 else "medium",
            )
        )

    # Party alignment
    if (
        politician_1.party
        and politician_2.party
        and politician_1.party != politician_2.party
    ):
        insights.append(
            ComparisonInsight(
                category="political",
                insight_type="difference",
                description=f"Different parties: {politician_1.party} vs {politician_2.party}",
                politician_1_value=politician_1.party,
                politician_2_value=politician_2.party,
                significance="medium",
            )
        )

    # Similar action types
    common_actions = set(politician_1.actions.actions_by_type.keys()) & set(
        politician_2.actions.actions_by_type.keys()
    )
    if len(common_actions) >= 3:
        insights.append(
            ComparisonInsight(
                category="actions",
                insight_type="similarity",
                description=f"Both politicians focus on similar action types: {', '.join(common_actions[:3])}",
                politician_1_value=list(politician_1.actions.actions_by_type.keys()),
                politician_2_value=list(politician_2.actions.actions_by_type.keys()),
                significance="low",
            )
        )

    return insights


# ==========================================================================
# API Endpoints
# ==========================================================================


@router.get(
    "/politicians/{politician_id_1}/with/{politician_id_2}",
    response_model=ComparisonResult,
    summary="Compare two politicians",
    description="Generate a comprehensive side-by-side comparison of two politicians",
    responses={
        200: {"description": "Successfully generated comparison"},
        404: {"description": "One or both politicians not found"},
    },
)
async def compare_politicians(
    politician_id_1: int,
    politician_id_2: int,
    comparison_type: str = Query(
        "comprehensive",
        description="Type of comparison to generate",
    ),
    db: Session = Depends(get_db),
):
    """
    Compare two politicians side-by-side.

    ### Comparison Types:
    - **comprehensive**: Full comparison including all metrics
    - **actions**: Compare actions and activity levels
    - **votes**: Compare voting patterns and attendance
    - **promises**: Compare promise fulfillment rates
    - **transparency**: Compare transparency scores

    Returns detailed comparison with insights and similarity score.
    """
    # Validate IDs are different
    if politician_id_1 == politician_id_2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot compare a politician with themselves",
        )

    # Fetch both politicians
    politician_1 = db.query(Politician).filter(Politician.id == politician_id_1).first()
    politician_2 = db.query(Politician).filter(Politician.id == politician_id_2).first()

    if not politician_1 or not politician_2:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician(s) not found. Checked IDs: {politician_id_1}, {politician_id_2}",
        )

    # Generate comparison data for each politician
    p1_comparison = await generate_politician_comparison_data(politician_1, db)
    p2_comparison = await generate_politician_comparison_data(politician_2, db)

    # Calculate similarity score
    similarity_score = calculate_similarity_score(politician_1, politician_2)

    # Generate insights
    insights = generate_insights(p1_comparison, p2_comparison)

    # Generate comparison metrics
    comparison_metrics = generate_comparison_metrics(p1_comparison, p2_comparison)

    return ComparisonResult(
        politician_1=p1_comparison,
        politician_2=p2_comparison,
        comparison_metrics=comparison_metrics,
        insights=insights,
        similarity_score=similarity_score,
        generated_at=datetime.utcnow(),
    )


async def generate_politician_comparison_data(
    politician: Politician, db: Session
) -> PoliticianComparison:
    """Generate comprehensive comparison data for a single politician"""

    # Calculate years in office
    end_date = politician.term_end or datetime.utcnow()
    years_in_office = (end_date - politician.term_start).days // 365

    # Actions comparison
    actions = await generate_action_comparison(politician.id, db)

    # Votes comparison
    votes = await generate_vote_comparison(politician.id, db)

    # Promises comparison
    promises = await generate_promise_comparison(politician.id, db)

    # Transparency comparison
    transparency = await generate_transparency_comparison(politician.id, db)

    return PoliticianComparison(
        politician_id=politician.id,
        full_name=politician.full_name
        or f"{politician.first_name} {politician.last_name}",
        office_title=politician.office_title,
        party=politician.party,
        state=politician.state,
        term_start=politician.term_start,
        term_end=politician.term_end,
        years_in_office=years_in_office,
        actions=actions,
        votes=votes,
        promises=promises,
        transparency=transparency,
    )


async def generate_action_comparison(
    politician_id: int, db: Session
) -> ActionComparison:
    """Generate action comparison data for a politician"""

    # Total actions
    total_actions = (
        db.query(Action).filter(Action.politician_id == politician_id).count()
    )

    # Actions by type
    actions_by_type = (
        db.query(Action.action_type, func.count(Action.id))
        .filter(Action.politician_id == politician_id)
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
        .filter(Action.politician_id == politician_id)
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
        .filter(Action.politician_id == politician_id)
        .group_by("month")
        .order_by("month")
        .all()
    )
    actions_by_month_dict = {month: count for month, count in actions_by_month}

    # Average impact level
    avg_impact = (
        db.query(func.avg(Action.impact_level))
        .filter(Action.politician_id == politician_id)
        .scalar()
        or 0.0
    )

    # Recent actions (last 10)
    recent_actions = (
        db.query(Action)
        .filter(Action.politician_id == politician_id)
        .order_by(Action.action_date.desc())
        .limit(10)
        .all()
    )
    recent_actions_list = [
        {
            "id": a.id,
            "type": a.action_type.value
            if hasattr(a.action_type, "value")
            else a.action_type,
            "title": a.title,
            "date": a.action_date,
            "impact": a.impact_level,
        }
        for a in recent_actions
    ]

    return ActionComparison(
        politician_id=politician_id,
        politician_name="",  # Will be filled by parent
        total_actions=total_actions,
        actions_by_type=actions_by_type_dict,
        actions_by_category=actions_by_category_dict,
        actions_by_month=actions_by_month_dict,
        avg_impact_level=round(avg_impact, 2),
        recent_actions=recent_actions_list,
    )


async def generate_vote_comparison(politician_id: int, db: Session) -> VoteComparison:
    """Generate vote comparison data for a politician"""

    politician = db.query(Politician).filter(Politician.id == politician_id).first()

    # Get all votes
    votes = db.query(Vote).filter(Vote.politician_id == politician_id).all()
    total_votes = len(votes)

    if total_votes == 0:
        return VoteComparison(
            politician_id=politician_id,
            politician_name="",
            party=politician.party if politician else None,
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

    # Calculate attendance rate
    attendance_rate = (
        ((total_votes - absent_votes) / total_votes * 100) if total_votes > 0 else 0.0
    )

    return VoteComparison(
        politician_id=politician_id,
        politician_name="",
        party=politician.party if politician else None,
        total_votes=total_votes,
        yea_votes=yea_votes,
        nay_votes=nay_votes,
        present_votes=present_votes,
        absent_votes=absent_votes,
        yea_percentage=round(yea_percentage, 2),
        nay_percentage=round(nay_percentage, 2),
        attendance_rate=round(attendance_rate, 2),
    )


async def generate_promise_comparison(
    politician_id: int, db: Session
) -> PromiseComparison:
    """Generate promise comparison data for a politician"""

    # Get all promises
    promises = db.query(Promise).filter(Promise.politician_id == politician_id).all()
    total_promises = len(promises)

    if total_promises == 0:
        return PromiseComparison(
            politician_id=politician_id,
            politician_name="",
            total_promises=0,
            fulfilled=0,
            partially_fulfilled=0,
            delayed=0,
            broken=0,
            active=0,
            fulfillment_rate=0.0,
            average_fulfillment_score=0.0,
            by_category={},
        )

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
    total_resolved = (
        status_counts["fulfilled"]
        + status_counts["partially_fulfilled"]
        + status_counts["delayed"]
        + status_counts["broken"]
    )

    if total_resolved > 0:
        fulfillment_rate = (
            status_counts["fulfilled"] * 100
            + status_counts["partially_fulfilled"] * 50
            + status_counts["delayed"] * 30
        ) / total_resolved
    else:
        fulfillment_rate = 0.0

    # Calculate average fulfillment score
    scores = [p.fulfillment_score for p in promises if p.fulfillment_score is not None]
    avg_score = round(sum(scores) / len(scores), 2) if scores else 0.0

    # Breakdown by category
    by_category = {}
    for promise in promises:
        if promise.category:
            if promise.category not in by_category:
                by_category[promise.category] = {"total": 0, "fulfilled": 0}
            by_category[promise.category]["total"] += 1
            status = (
                promise.fulfillment_status.value
                if hasattr(promise.fulfillment_status, "value")
                else str(promise.fulfillment_status)
            )
            if status == "fulfilled":
                by_category[promise.category]["fulfilled"] += 1

    return PromiseComparison(
        politician_id=politician_id,
        politician_name="",
        total_promises=total_promises,
        fulfilled=status_counts["fulfilled"],
        partially_fulfilled=status_counts["partially_fulfilled"],
        delayed=status_counts["delayed"],
        broken=status_counts["broken"],
        active=status_counts["active"],
        fulfillment_rate=round(fulfillment_rate, 2),
        average_fulfillment_score=avg_score,
        by_category=by_category,
    )


async def generate_transparency_comparison(
    politician_id: int, db: Session
) -> TransparencyComparison:
    """Generate transparency comparison data for a politician"""

    # Get latest transparency score
    latest_score = (
        db.query(TransparencyScore)
        .filter(TransparencyScore.politician_id == politician_id)
        .order_by(TransparencyScore.calculated_at.desc())
        .first()
    )

    if not latest_score:
        return TransparencyComparison(
            politician_id=politician_id,
            politician_name="",
            overall_score=0.0,
            letter_grade="F",
            star_rating=1,
            voting_record_score=0.0,
            promise_fulfillment_score=0.0,
            public_communication_score=0.0,
            document_release_score=0.0,
            conflict_disclosure_score=0.0,
            meeting_transparency_score=0.0,
            rank=None,
            trend="stable",
            trend_magnitude=0.0,
        )

    return TransparencyComparison(
        politician_id=politician_id,
        politician_name="",
        overall_score=latest_score.overall_score,
        letter_grade=latest_score.letter_grade,
        star_rating=latest_score.star_rating,
        voting_record_score=latest_score.voting_record_score or 0.0,
        promise_fulfillment_score=latest_score.promise_fulfillment_score or 0.0,
        public_communication_score=latest_score.public_communication_score or 0.0,
        document_release_score=latest_score.document_release_score or 0.0,
        conflict_disclosure_score=latest_score.conflict_disclosure_score or 0.0,
        meeting_transparency_score=latest_score.meeting_transparency_score or 0.0,
        rank=latest_score.rank,
        trend=latest_score.trend or "stable",
        trend_magnitude=latest_score.trend_magnitude or 0.0,
    )


def generate_comparison_metrics(
    p1: PoliticianComparison, p2: PoliticianComparison
) -> Dict[str, Dict[str, any]]:
    """Generate comparison metrics between two politicians"""

    # Action metrics
    action_ratio = (
        p1.actions.total_actions / p2.actions.total_actions
        if p2.actions.total_actions > 0
        else float("inf")
    )

    # Vote metrics
    vote_ratio = (
        p1.votes.total_votes / p2.votes.total_votes
        if p2.votes.total_votes > 0
        else float("inf")
    )

    # Promise metrics
    promise_ratio = (
        p1.promises.total_promises / p2.promises.total_promises
        if p2.promises.total_promises > 0
        else float("inf")
    )

    # Transparency difference
    transparency_diff = p1.transparency.overall_score - p2.transparency.overall_score

    # Years in office difference
    years_diff = p1.years_in_office - p2.years_in_office

    return {
        "actions": {
            "p1_total": p1.actions.total_actions,
            "p2_total": p2.actions.total_actions,
            "ratio": round(action_ratio, 2),
            "p1_wins": action_ratio > 1,
        },
        "votes": {
            "p1_total": p1.votes.total_votes,
            "p2_total": p2.votes.total_votes,
            "ratio": round(vote_ratio, 2),
            "p1_wins": vote_ratio > 1,
        },
        "promises": {
            "p1_total": p1.promises.total_promises,
            "p2_total": p2.promises.total_promises,
            "ratio": round(promise_ratio, 2),
            "p1_fulfillment_rate": p1.promises.fulfillment_rate,
            "p2_fulfillment_rate": p2.promises.fulfillment_rate,
            "p1_wins": p1.promises.fulfillment_rate > p2.promises.fulfillment_rate,
        },
        "transparency": {
            "p1_score": p1.transparency.overall_score,
            "p2_score": p2.transparency.overall_score,
            "difference": round(transparency_diff, 2),
            "p1_wins": transparency_diff > 0,
        },
        "tenure": {
            "p1_years": p1.years_in_office,
            "p2_years": p2.years_in_office,
            "difference": years_diff,
            "p1_longer": years_diff > 0,
        },
    }


@router.get(
    "/vote-similarity/{politician_id_1}/with/{politician_id_2}",
    summary="Compare voting similarity",
    description="Calculate voting similarity score between two politicians",
    responses={
        200: {"description": "Successfully calculated voting similarity"},
        404: {"description": "One or both politicians not found"},
    },
)
async def compare_voting_similarity(
    politician_id_1: int,
    politician_id_2: int,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
):
    """
    Calculate how often two politicians vote the same way.

    Returns:
    - Similarity score (0-100%)
    - Number of votes compared
    - Agreement breakdown by vote type
    """
    # Fetch both politicians
    politician_1 = db.query(Politician).filter(Politician.id == politician_id_1).first()
    politician_2 = db.query(Politician).filter(Politician.id == politician_id_2).first()

    if not politician_1 or not politician_2:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician(s) not found. Checked IDs: {politician_id_1}, {politician_id_2}",
        )

    # Get votes for both politicians
    filter_condition = Vote.politician_id.in_([politician_id_1, politician_id_2])

    if start_date:
        filter_condition = and_(filter_condition, Vote.vote_date >= start_date)
    if end_date:
        filter_condition = and_(filter_condition, Vote.vote_date <= end_date)

    votes = (
        db.query(Vote)
        .filter(filter_condition)
        .filter(Vote.bill_id.isnot(None))  # Only votes on bills
        .all()
    )

    # Organize votes by bill
    p1_votes = {}
    p2_votes = {}

    for vote in votes:
        if vote.bill_id:
            if vote.politician_id == politician_id_1:
                p1_votes[vote.bill_id] = vote.vote_type
            else:
                p2_votes[vote.bill_id] = vote.vote_type

    # Find common votes
    common_bills = set(p1_votes.keys()) & set(p2_votes.keys())

    if not common_bills:
        return {
            "politician_1": politician_1.full_name,
            "politician_2": politician_2.full_name,
            "similarity_score": 0.0,
            "votes_compared": 0,
            "message": "No common votes found for the specified criteria",
        }

    # Calculate agreements
    agreements = sum(1 for bill in common_bills if p1_votes[bill] == p2_votes[bill])
    disagreements = len(common_bills) - agreements

    similarity_score = (agreements / len(common_bills)) * 100

    # Calculate breakdown
    agreement_breakdown = {}
    for bill in common_bills:
        if p1_votes[bill] == p2_votes[bill]:
            vote_type = p1_votes[bill]
            if vote_type not in agreement_breakdown:
                agreement_breakdown[vote_type] = 0
            agreement_breakdown[vote_type] += 1

    return {
        "politician_1": politician_1.full_name
        or f"{politician_1.first_name} {politician_1.last_name}",
        "politician_2": politician_2.full_name
        or f"{politician_2.first_name} {politician_2.last_name}",
        "similarity_score": round(similarity_score, 2),
        "votes_compared": len(common_bills),
        "agreements": agreements,
        "disagreements": disagreements,
        "agreement_breakdown": agreement_breakdown,
        "interpretation": (
            "Very similar"
            if similarity_score > 80
            else "Similar"
            if similarity_score > 60
            else "Somewhat similar"
            if similarity_score > 40
            else "Different"
            if similarity_score > 20
            else "Very different"
        ),
    }

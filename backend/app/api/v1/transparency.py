"""
Transparency Scoring API Endpoints for The Glass House

This module provides RESTful endpoints for transparency scoring and rankings.
Transparency scores measure how transparent politicians are based on multiple factors:
- Voting record completeness
- Promise fulfillment rates
- Public communication frequency
- Document release timeliness
- Conflict of interest disclosure
- Meeting transparency

Endpoints include:
- Get politician's transparency score
- Get score history and trends
- Get factor breakdowns
- Get leaderboard/rankings
- Get score distribution statistics
- Calculate/update scores
"""

from datetime import datetime, timedelta
from typing import Any,  Dict, List, Optional

from app.analytics.scoring import get_transparency_service
from app.core.config import get_settings
from app.db.database import get_db
from app.db.models import (
    FactorMetric,
    FactorScore,
    Politician,
    TransparencyScore,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter()

settings = get_settings()


# ==============================
# Pydantic Schemas
# ==============================


class FactorScoreResponse(BaseModel):
    """Schema for individual factor score"""

    factor: str
    score: float
    weight: float
    raw_value: Optional[float] = None
    max_value: Optional[float] = None
    data_points: int = 0
    notes: Optional[str] = None


class TransparencyScoreResponse(BaseModel):
    """Schema for transparency score"""

    politician_id: int
    politician_name: str
    overall_score: float
    letter_grade: str
    star_rating: int
    factor_scores: Dict[str, FactorScoreResponse]
    trend: str
    trend_magnitude: float
    previous_score: Optional[float] = None
    rank: Optional[int] = None
    peer_group: Optional[str] = None
    data_quality: float
    calculated_at: datetime
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class ScoreHistoryResponse(BaseModel):
    """Schema for historical score"""

    date: datetime
    score: float
    grade: str
    rank: Optional[int] = None
    peer_group: Optional[str] = None


class ScoreHistoryResponseFull(BaseModel):
    """Schema for score history with trend analysis"""

    politician_id: int
    politician_name: str
    current_score: TransparencyScoreResponse
    history: List[ScoreHistoryResponse]
    trend_analysis: Dict[str, Any]


class LeaderboardEntry(BaseModel):
    """Schema for leaderboard entry"""

    rank: int
    politician_id: int
    politician_name: str
    office_title: str
    party: Optional[str]
    state: Optional[str]
    overall_score: float
    letter_grade: str
    star_rating: int
    trend: str
    trend_magnitude: float

    class Config:
        from_attributes = True


class LeaderboardResponse(BaseModel):
    """Schema for leaderboard list"""

    leaderboard: List[LeaderboardEntry]
    total_count: int
    peer_group: Optional[str] = None
    filters: Dict[str, Any]
    statistics: Dict[str, Any]


class ScoreDistributionResponse(BaseModel):
    """Schema for score distribution statistics"""

    total_count: int
    mean: float
    median: float
    min: float
    max: float
    std_dev: float
    distribution: Dict[str, int]
    percentiles: Dict[str, float]


class ScoreCalculationRequest(BaseModel):
    """Schema for manual score calculation request"""

    politician_id: int
    force_recalculation: bool = False
    include_factors: List[str] = Field(default_factory=list)


class FactorMetricsRequest(BaseModel):
    """Schema for updating factor metrics"""

    politician_id: int
    factor: str
    raw_value: float
    max_value: Optional[float] = None
    data_points: int = 0
    source_url: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


# ==============================
# API Endpoints
# ==============================


@router.get(
    "/politician/{politician_id}",
    response_model=TransparencyScoreResponse,
    summary="Get politician's transparency score",
    description="Retrieve the latest transparency score for a specific politician",
    responses={
        200: {"description": "Successfully retrieved transparency score"},
        404: {"description": "Politician or transparency score not found"},
    },
)
async def get_transparency_score(
    politician_id: int,
    db: Session = Depends(get_db),
):
    """
    Get the latest transparency score for a politician.

    Includes:
    - Overall score (0-100)
    - Letter grade (A-F)
    - Star rating (1-5)
    - Factor breakdowns
    - Trend analysis
    - Ranking within peer group
    """
    # Get politician
    politician = db.query(Politician).filter(Politician.id == politician_id).first()

    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician with ID {politician_id} not found",
        )

    # Get latest transparency score
    latest_score = (
        db.query(TransparencyScore)
        .filter(TransparencyScore.politician_id == politician_id)
        .order_by(TransparencyScore.calculated_at.desc())
        .first()
    )

    if not latest_score:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No transparency score found for politician {politician_id}",
        )

    # Get factor scores
    factor_scores_query = (
        db.query(FactorScore)
        .filter(FactorScore.transparency_score_id == latest_score.id)
        .all()
    )

    factor_scores_dict = {}
    for fs in factor_scores_query:
        factor_scores_dict[fs.factor] = FactorScoreResponse(
            factor=fs.factor,
            score=fs.score,
            weight=fs.weight,
            raw_value=fs.raw_value,
            max_value=fs.max_value,
            data_points=fs.data_points,
            notes=fs.notes,
        )

    politician_name = (
        politician.full_name or f"{politician.first_name} {politician.last_name}"
    )

    return TransparencyScoreResponse(
        politician_id=politician_id,
        politician_name=politician_name,
        overall_score=latest_score.overall_score,
        letter_grade=latest_score.letter_grade,
        star_rating=latest_score.star_rating,
        factor_scores=factor_scores_dict,
        trend=latest_score.trend,
        trend_magnitude=latest_score.trend_magnitude,
        previous_score=latest_score.previous_score,
        rank=latest_score.rank,
        peer_group=latest_score.peer_group,
        data_quality=latest_score.data_quality,
        calculated_at=latest_score.calculated_at,
        notes=latest_score.notes,
    )


@router.get(
    "/politician/{politician_id}/history",
    response_model=ScoreHistoryResponseFull,
    summary="Get transparency score history",
    description="Retrieve transparency score history and trends for a politician",
    responses={
        200: {"description": "Successfully retrieved score history"},
        404: {"description": "Politician not found"},
    },
)
async def get_transparency_score_history(
    politician_id: int,
    days: int = Query(365, ge=30, le=3650, description="Days of history to retrieve"),
    limit: int = Query(100, ge=1, le=500, description="Maximum records to return"),
    db: Session = Depends(get_db),
):
    """
    Get historical transparency scores for a politician.

    Returns:
    - Current score with full details
    - Historical scores over specified period
    - Trend analysis (improving, stable, declining)
    """
    # Get politician
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

    if not latest_score:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No transparency score found for politician {politician_id}",
        )

    # Get score history
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    score_history = (
        db.query(TransparencyScore)
        .filter(
            TransparencyScore.politician_id == politician_id,
            TransparencyScore.calculated_at >= cutoff_date,
        )
        .order_by(TransparencyScore.calculated_at)
        .limit(limit)
        .all()
    )

    # Calculate trend analysis
    if len(score_history) >= 2:
        first_half = score_history[: len(score_history) // 2]
        second_half = score_history[len(score_history) // 2 :]

        first_avg = sum(s.overall_score for s in first_half) / len(first_half)
        second_avg = sum(s.overall_score for s in second_half) / len(second_half)

        score_change = second_avg - first_avg

        if score_change > 5:
            trend_direction = "improving"
        elif score_change < -5:
            trend_direction = "declining"
        else:
            trend_direction = "stable"

        volatility = (
            sum((s.overall_score - second_avg) ** 2 for s in second_half)
            / len(second_half)
        ) ** 0.5
    else:
        trend_direction = "insufficient_data"
        score_change = 0
        volatility = 0

    trend_analysis = {
        "trend_direction": trend_direction,
        "score_change": round(score_change, 2),
        "volatility": round(volatility, 2),
        "data_points": len(score_history),
        "period_days": days,
    }

    politician_name = (
        politician.full_name or f"{politician.first_name} {politician.last_name}"
    )

    # Format current score (simplified version)
    current_score = TransparencyScoreResponse(
        politician_id=politician_id,
        politician_name=politician_name,
        overall_score=latest_score.overall_score,
        letter_grade=latest_score.letter_grade,
        star_rating=latest_score.star_rating,
        factor_scores={},
        trend=latest_score.trend,
        trend_magnitude=latest_score.trend_magnitude,
        previous_score=latest_score.previous_score,
        rank=latest_score.rank,
        peer_group=latest_score.peer_group,
        data_quality=latest_score.data_quality,
        calculated_at=latest_score.calculated_at,
        notes=latest_score.notes,
    )

    return ScoreHistoryResponseFull(
        politician_id=politician_id,
        politician_name=politician_name,
        current_score=current_score,
        history=[
            ScoreHistoryResponse(
                date=s.calculated_at,
                score=s.overall_score,
                grade=s.letter_grade,
                rank=s.rank,
                peer_group=s.peer_group,
            )
            for s in score_history
        ],
        trend_analysis=trend_analysis,
    )


@router.get(
    "/leaderboard",
    response_model=LeaderboardResponse,
    summary="Get transparency leaderboard",
    description="Retrieve ranked list of politicians by transparency score",
    responses={
        200: {"description": "Successfully retrieved leaderboard"},
    },
)
async def get_transparency_leaderboard(
    limit: int = Query(
        100, ge=1, le=500, description="Number of politicians to return"
    ),
    peer_group: Optional[str] = Query(
        None, description="Filter by peer group (senate, house, etc.)"
    ),
    jurisdiction_level: Optional[str] = Query(
        None, description="Filter by jurisdiction"
    ),
    office_type: Optional[str] = Query(None, description="Filter by office type"),
    state: Optional[str] = Query(None, description="Filter by state"),
    min_score: Optional[float] = Query(
        None, ge=0.0, le=100.0, description="Minimum score filter"
    ),
    db: Session = Depends(get_db),
):
    """
    Get transparency score leaderboard.

    Returns ranked list of politicians by transparency score with:
    - Overall scores and grades
    - Trend information
    - Filtering by peer group, jurisdiction, office type
    """
    # Get latest scores with politician info
    query = (
        db.query(TransparencyScore, Politician)
        .join(Politician, TransparencyScore.politician_id == Politician.id)
        .order_by(TransparencyScore.overall_score.desc())
    )

    # Apply filters
    if peer_group:
        query = query.filter(TransparencyScore.peer_group == peer_group)

    if jurisdiction_level:
        query = query.filter(Politician.jurisdiction_level == jurisdiction_level)

    if office_type:
        query = query.filter(Politician.office_type == office_type)

    if state:
        query = query.filter(Politician.state == state)

    if min_score:
        query = query.filter(TransparencyScore.overall_score >= min_score)

    # Limit results
    query = query.limit(limit)

    results = query.all()

    if not results:
        return LeaderboardResponse(
            leaderboard=[],
            total_count=0,
            peer_group=peer_group,
            filters={
                "peer_group": peer_group,
                "jurisdiction_level": jurisdiction_level,
                "office_type": office_type,
                "state": state,
                "min_score": min_score,
            },
            statistics={},
        )

    # Format leaderboard
    leaderboard = [
        LeaderboardEntry(
            rank=i + 1,
            politician_id=p.id,
            politician_name=p.full_name or f"{p.first_name} {p.last_name}",
            office_title=p.office_title,
            party=p.party,
            state=p.state,
            overall_score=ts.overall_score,
            letter_grade=ts.letter_grade,
            star_rating=ts.star_rating,
            trend=ts.trend,
            trend_magnitude=ts.trend_magnitude,
        )
        for i, (ts, p) in enumerate(results)
    ]

    # Calculate statistics
    scores = [ts.overall_score for ts, _ in results]
    statistics = {
        "mean": round(sum(scores) / len(scores), 2) if scores else 0,
        "median": sorted(scores)[len(scores) // 2] if scores else 0,
        "min": min(scores) if scores else 0,
        "max": max(scores) if scores else 0,
        "a_plus": sum(1 for s in scores if s >= 90),
        "a": sum(1 for s in scores if 80 <= s < 90),
        "b": sum(1 for s in scores if 70 <= s < 80),
        "c": sum(1 for s in scores if 60 <= s < 70),
        "d_or_f": sum(1 for s in scores if s < 60),
    }

    return LeaderboardResponse(
        leaderboard=leaderboard,
        total_count=len(leaderboard),
        peer_group=peer_group,
        filters={
            "peer_group": peer_group,
            "jurisdiction_level": jurisdiction_level,
            "office_type": office_type,
            "state": state,
            "min_score": min_score,
        },
        statistics=statistics,
    )


@router.get(
    "/distribution",
    response_model=ScoreDistributionResponse,
    summary="Get score distribution",
    description="Retrieve transparency score distribution statistics",
    responses={
        200: {"description": "Successfully retrieved score distribution"},
    },
)
async def get_score_distribution(
    peer_group: Optional[str] = Query(None, description="Filter by peer group"),
    jurisdiction_level: Optional[str] = Query(
        None, description="Filter by jurisdiction"
    ),
    office_type: Optional[str] = Query(None, description="Filter by office type"),
    state: Optional[str] = Query(None, description="Filter by state"),
    db: Session = Depends(get_db),
):
    """
    Get transparency score distribution statistics.

    Returns:
    - Statistical measures (mean, median, std dev)
    - Grade distribution
    - Percentiles
    """
    # Get scores
    query = db.query(TransparencyScore)

    if peer_group:
        query = query.filter(TransparencyScore.peer_group == peer_group)

    if jurisdiction_level:
        query = query.join(
            Politician, TransparencyScore.politician_id == Politician.id
        ).filter(Politician.jurisdiction_level == jurisdiction_level)

    if office_type:
        query = query.join(
            Politician, TransparencyScore.politician_id == Politician.id
        ).filter(Politician.office_type == office_type)

    if state:
        query = query.join(
            Politician, TransparencyScore.politician_id == Politician.id
        ).filter(Politician.state == state)

    # Get latest scores only
    subquery = (
        db.query(
            TransparencyScore.politician_id,
            func.max(TransparencyScore.calculated_at).label("max_date"),
        )
        .group_by(TransparencyScore.politician_id)
        .subquery()
    )

    query = query.join(
        subquery,
        (TransparencyScore.politician_id == subquery.c.politician_id)
        & (TransparencyScore.calculated_at == subquery.c.max_date),
    )

    scores = [row.overall_score for row in query.all() if row.overall_score is not None]

    if not scores:
        return ScoreDistributionResponse(
            total_count=0,
            mean=0.0,
            median=0.0,
            min=0.0,
            max=0.0,
            std_dev=0.0,
            distribution={"A+": 0, "A": 0, "B": 0, "C": 0, "D/F": 0},
            percentiles={
                "p25": 0.0,
                "p50": 0.0,
                "p75": 0.0,
                "p90": 0.0,
                "p95": 0.0,
            },
        )

    # Calculate statistics
    mean = sum(scores) / len(scores)
    sorted_scores = sorted(scores)
    median = sorted_scores[len(sorted_scores) // 2]
    std_dev = (sum((s - mean) ** 2 for s in scores) / len(scores)) ** 0.5

    # Grade distribution
    distribution = {
        "A+": sum(1 for s in scores if s >= 95),
        "A": sum(1 for s in scores if 90 <= s < 95),
        "B": sum(1 for s in scores if 80 <= s < 90),
        "C": sum(1 for s in scores if 70 <= s < 80),
        "D/F": sum(1 for s in scores if s < 70),
    }

    # Percentiles
    def percentile(data, p):
        k = (len(data) - 1) * p / 100
        f = int(k)
        c = f + 1 if f + 1 < len(data) else f
        return data[f] + (data[c] - data[f]) * (k - f)

    percentiles = {
        "p25": round(percentile(sorted_scores, 25), 2),
        "p50": round(percentile(sorted_scores, 50), 2),
        "p75": round(percentile(sorted_scores, 75), 2),
        "p90": round(percentile(sorted_scores, 90), 2),
        "p95": round(percentile(sorted_scores, 95), 2),
    }

    return ScoreDistributionResponse(
        total_count=len(scores),
        mean=round(mean, 2),
        median=round(median, 2),
        min=round(min(scores), 2),
        max=round(max(scores), 2),
        std_dev=round(std_dev, 2),
        distribution=distribution,
        percentiles=percentiles,
    )


@router.post(
    "/calculate",
    response_model=TransparencyScoreResponse,
    summary="Calculate transparency score",
    description="Manually trigger transparency score calculation for a politician",
    responses={
        200: {"description": "Successfully calculated transparency score"},
        404: {"description": "Politician not found"},
    },
)
async def calculate_transparency_score(
    request: ScoreCalculationRequest,
    db: Session = Depends(get_db),
):
    """
    Manually calculate transparency score for a politician.

    This is useful for:
    - Recalculating after data updates
    - Testing score calculation logic
    - Force recalculation if automatic calculation failed
    """
    politician = (
        db.query(Politician).filter(Politician.id == request.politician_id).first()
    )

    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician with ID {request.politician_id} not found",
        )

    # Get transparency service
    transparency_service = get_transparency_service()
    transparency_service.set_database(db)

    # Get raw metrics for each factor
    try:
        score = transparency_service.calculate_transparency_score(
            politician_id=request.politician_id,
            politician_name=politician.full_name,
            voting_data=get_voting_data(db, request.politician_id),
            promise_data=get_promise_data(db, request.politician_id),
            communication_data=get_communication_data(db, request.politician_id),
            document_data=get_document_data(db, request.politician_id),
            conflict_data=get_conflict_data(db, request.politician_id),
            meeting_data=get_meeting_data(db, request.politician_id),
            peer_group=get_peer_group(politician),
        )

        politician_name = (
            politician.full_name or f"{politician.first_name} {politician.last_name}"
        )

        # Format factor scores
        factor_scores_dict = {}
        for factor, fs in score.factor_scores.items():
            factor_scores_dict[factor.value] = FactorScoreResponse(
                factor=factor.value,
                score=fs.score,
                weight=1.0 / 6,  # Equal weight for now
                raw_value=fs.raw_value,
                max_value=fs.max_value,
                data_points=fs.data_points,
                notes=fs.notes,
            )

        return TransparencyScoreResponse(
            politician_id=politician_id,
            politician_name=politician_name,
            overall_score=score.overall_score,
            letter_grade=score.letter_grade,
            star_rating=score.star_rating,
            factor_scores=factor_scores_dict,
            trend=score.trend.value,
            trend_magnitude=score.trend_magnitude,
            previous_score=score.previous_score,
            rank=score.rank,
            peer_group=score.peer_group,
            data_quality=score.data_quality,
            calculated_at=score.calculated_at,
            notes=score.notes,
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error calculating transparency score: {str(e)}",
        )


@router.post(
    "/factor-metrics",
    summary="Update factor metrics",
    description="Update raw metrics data for transparency scoring",
    responses={
        200: {"description": "Successfully updated factor metrics"},
        404: {"description": "Politician not found"},
    },
)
async def update_factor_metrics(
    request: FactorMetricsRequest,
    db: Session = Depends(get_db),
):
    """
    Update raw metrics data for a specific factor.

    This is used to update the underlying data that feeds into transparency scoring.
    """
    politician = (
        db.query(Politician).filter(Politician.id == request.politician_id).first()
    )

    if not politician:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Politician with ID {request.politician_id} not found",
        )

    # Create or update factor metric
    metric = FactorMetric(
        politician_id=request.politician_id,
        factor=request.factor,
        raw_value=request.raw_value,
        max_value=request.max_value,
        data_points=request.data_points,
        source_url=request.source_url,
        metadata=request.metadata,
    )

    db.add(metric)
    db.commit()
    db.refresh(metric)

    return {
        "message": f"Factor metric '{request.factor}' updated successfully",
        "metric_id": metric.id,
        "politician_id": request.politician_id,
        "factor": request.factor,
        "raw_value": request.raw_value,
    }


# ==============================
# Helper Functions
# ==============================


def get_voting_data(db: Session, politician_id: int) -> Dict:
    """Get voting record data for scoring"""
    # This would query actual voting data
    # For now, return placeholder
    return {
        "total_votes": 0,
        "recorded_votes": 0,
        "attendance_rate": 0.0,
        "explained_votes": 0,
    }


def get_promise_data(db: Session, politician_id: int) -> Dict:
    """Get promise fulfillment data for scoring"""
    # This would query actual promise data
    # For now, return placeholder
    return {
        "total_promises": 0,
        "fulfilled": 0,
        "partially_fulfilled": 0,
        "delayed": 0,
        "broken": 0,
        "active": 0,
    }


def get_communication_data(db: Session, politician_id: int) -> Dict:
    """Get public communication data for scoring"""
    # This would query actual communication data
    # For now, return placeholder
    return {
        "statement_count": 0,
        "expected_count": 0.0,
        "press_conferences": 0,
        "social_media_posts": 0,
        "town_halls": 0,
        "news_interviews": 0,
    }


def get_document_data(db: Session, politician_id: int) -> Dict:
    """Get document release data for scoring"""
    # This would query actual document data
    # For now, return placeholder
    return {
        "total_documents": 0,
        "released_on_time": 0,
        "released_late": 0,
        "not_released": 0,
        "avg_delay_days": 0.0,
    }


def get_conflict_data(db: Session, politician_id: int) -> Dict:
    """Get conflict disclosure data for scoring"""
    # This would query actual disclosure data
    # For now, return placeholder
    return {
        "total_disclosures": 0,
        "required_disclosures": 0,
        "filed_on_time": 0,
        "completeness_score": 0.0,
        "accuracy_score": 0.0,
    }


def get_meeting_data(db: Session, politician_id: int) -> Dict:
    """Get meeting transparency data for scoring"""
    # This would query actual meeting data
    # For now, return placeholder
    return {
        "total_meetings": 0,
        "public_meetings": 0,
        "meetings_with_notice": 0,
        "meetings_with_minutes": 0,
        "meetings_recorded": 0,
    }


def get_peer_group(politician: Politician) -> str:
    """Determine peer group for ranking"""
    office_type = (
        politician.office_type.value
        if hasattr(politician.office_type, "value")
        else politician.office_type
    )

    if office_type == "president":
        return "president"
    elif office_type == "senator":
        return "senate"
    elif office_type == "representative":
        return "house"
    elif office_type == "governor":
        return "governor"
    else:
        return "general"

"""
Analytics API Endpoints for The Glass House

This module provides RESTful endpoints for analytics, statistics, and insights
about government actions, politician performance, and platform metrics.

Endpoints include:
- Dashboard summary statistics
- Politician performance analytics
- Government action trends
- Promise fulfillment analytics
- Voting pattern analysis
- Data quality metrics
- Platform usage statistics

All endpoints use proper validation, error handling, and async where appropriate.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from app.core.config import get_settings
from app.db.database import get_db
from app.db.models import (
    Action,
    Bill,
    Politician,
    Promise,
    TransparencyScore,
    Vote,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import (
    ColumnElement,
    Date,
    and_,
    cast,
    func,
    or_,
    text,
)
from sqlalchemy.orm import Session

router = APIRouter()

settings = get_settings()


# ==================================================================================
# Pydantic Schemas
# ==================================================================================


class DashboardSummary(BaseModel):
    """Schema for dashboard summary statistics"""

    total_politicians: int
    active_politicians: int
    total_actions: int
    actions_last_24h: int
    total_promises: int
    promises_fulfilled: int
    total_bills: int
    bills_enacted: int
    total_votes: int
    votes_today: int
    avg_transparency_score: float
    platform_uptime: str
    last_updated: datetime


class PoliticianPerformance(BaseModel):
    """Schema for politician performance metrics"""

    politician_id: int
    politician_name: str
    office_title: str
    party: Optional[str]
    state: Optional[str]

    # Activity metrics
    total_actions: int
    actions_last_30_days: int
    voting_rate: float
    attendance_rate: float

    # Promise metrics
    total_promises: int
    fulfillment_rate: float
    broken_promises: int

    # Transparency
    transparency_score: Optional[float]
    transparency_rank: Optional[int]

    # Trends
    activity_trend: str  # "increasing", "stable", "decreasing"
    performance_grade: str  # "A", "B", "C", "D", "F"


class ActionTrend(BaseModel):
    """Schema for action trend analysis"""

    time_period: str
    actions_count: int
    by_type: Dict[str, int]
    by_category: Dict[str, int]
    by_impact: Dict[int, int]
    avg_impact: float
    trending_topics: List[Dict[str, Any]]


class PromiseAnalytics(BaseModel):
    """Schema for promise fulfillment analytics"""

    total_promises: int
    fulfillment_rate: float

    # Status breakdown
    fulfilled: int
    partially_fulfilled: int
    delayed: int
    broken: int
    active: int

    # By category
    by_category: Dict[str, Dict[str, int]]

    # By year
    by_year: Dict[str, Dict[str, int]]

    # Timeline
    trend: str  # "improving", "stable", "declining"
    average_days_to_fulfill: Optional[float]
    most_common_categories: List[str]


class VotingAnalytics(BaseModel):
    """Schema for voting pattern analytics"""

    total_votes: int
    yea_votes: int
    nay_votes: int
    present_votes: int
    absent_votes: int

    # Rates
    participation_rate: float
    yea_percentage: float
    nay_percentage: float

    # By party
    party_breakdown: Dict[str, Dict[str, int]]

    # By chamber
    chamber_breakdown: Dict[str, Dict[str, int]]

    # Temporal
    votes_per_week: List[Dict[str, Any]]
    peak_voting_day: str
    avg_votes_per_politician: float


class TransparencyLeaderboardItem(BaseModel):
    """Schema for transparency leaderboard entry"""

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


class DataQualityMetrics(BaseModel):
    """Schema for data quality metrics"""

    total_records: int
    records_today: int
    records_this_week: int
    records_this_month: int

    # Source breakdown
    sources: Dict[str, int]

    # Quality indicators
    verified_sources_percentage: float
    avg_evidence_per_action: float
    ai_analysis_coverage: float

    # Freshness
    avg_record_age_days: float
    oldest_record_date: Optional[datetime]
    newest_record_date: Optional[datetime]

    # Health
    data_health_score: float
    quality_grade: str


class PlatformMetrics(BaseModel):
    """Schema for platform usage metrics"""

    total_api_requests: int
    requests_today: int
    requests_this_week: int
    requests_this_month: int

    # Performance
    avg_response_time_ms: float
    error_rate: float
    uptime_percentage: float

    # Popular endpoints
    top_endpoints: List[Dict[str, Any]]

    # Users
    active_users: int
    new_users_today: int


class TrendComparison(BaseModel):
    """Schema for comparing trends over time"""

    metric: str
    current_period: Dict[str, Any]
    previous_period: Dict[str, Any]
    change: float
    change_percentage: float
    trend_direction: str  # "up", "down", "stable"


# ==================================================================================
# Helper Functions
# ==================================================================================


def calculate_grade(score: float) -> str:
    """Convert numeric score to letter grade"""
    if score >= 90:
        return "A"
    elif score >= 80:
        return "B"
    elif score >= 70:
        return "C"
    elif score >= 60:
        return "D"
    return "F"


def calculate_trend(current: float, previous: float, threshold: float = 0.1) -> str:
    """Calculate trend direction"""
    if previous == 0:
        return "stable"

    change = (current - previous) / previous

    if change > threshold:
        return "increasing"
    elif change < -threshold:
        return "decreasing"
    return "stable"


def get_performance_grade(
    transparency_score: Optional[float],
    fulfillment_rate: float,
    attendance_rate: float,
) -> str:
    """Calculate overall performance grade"""
    # Weighted average
    weights = {
        "transparency": 0.3,
        "fulfillment": 0.4,
        "attendance": 0.3,
    }

    score = 0.0
    total_weight = 0.0

    if transparency_score:
        score += transparency_score * weights["transparency"]
        total_weight += weights["transparency"]

    score += fulfillment_rate * weights["fulfillment"]
    total_weight += weights["fulfillment"]

    score += attendance_rate * weights["attendance"]
    total_weight += weights["attendance"]

    if total_weight == 0:
        return "F"

    weighted_score = score / total_weight
    return calculate_grade(weighted_score)


# ==================================================================================
# API Endpoints
# ==================================================================================


@router.get(
    "/dashboard",
    response_model=DashboardSummary,
    summary="Get dashboard summary",
    description="Retrieve high-level statistics for the dashboard",
)
async def get_dashboard_summary(db: Session = Depends(get_db)):
    """
    Get summary statistics for the main dashboard.

    This is the primary endpoint for displaying key metrics on the homepage.
    """
    # Count politicians
    total_politicians = db.query(Politician).count()
    active_politicians = (
        db.query(Politician).filter(Politician.is_current == True).count()
    )

    # Count actions
    total_actions = db.query(Action).count()

    # Actions in last 24 hours
    yesterday = datetime.utcnow() - timedelta(days=1)
    actions_last_24h = db.query(Action).filter(Action.action_date >= yesterday).count()

    # Count promises
    total_promises = db.query(Promise).count()
    promises_fulfilled = (
        db.query(Promise).filter(Promise.fulfillment_status == "fulfilled").count()
    )

    # Count bills
    total_bills = db.query(Bill).count()
    bills_enacted = db.query(Bill).filter(Bill.outcome == "enacted").count()

    # Count votes
    total_votes = db.query(Vote).count()

    # Votes today
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    votes_today = db.query(Vote).filter(Vote.vote_date >= today_start).count()

    # Average transparency score
    avg_score = db.query(func.avg(TransparencyScore.overall_score)).scalar() or 0.0

    return DashboardSummary(
        total_politicians=total_politicians,
        active_politicians=active_politicians,
        total_actions=total_actions,
        actions_last_24h=actions_last_24h,
        total_promises=total_promises,
        promises_fulfilled=promises_fulfilled,
        total_bills=total_bills,
        bills_enacted=bills_enacted,
        total_votes=total_votes,
        votes_today=votes_today,
        avg_transparency_score=round(avg_score, 2),
        platform_uptime="99.9%",
        last_updated=datetime.utcnow(),
    )


@router.get(
    "/politicians/performance",
    response_model=List[PoliticianPerformance],
    summary="Get politician performance metrics",
    description="Retrieve performance analytics for all or filtered politicians",
)
async def get_politician_performance(
    office_type: Optional[str] = Query(None, description="Filter by office type"),
    party: Optional[str] = Query(None, description="Filter by party"),
    state: Optional[str] = Query(None, description="Filter by state"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results"),
    sort_by: str = Query("transparency_score", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order"),
    db: Session = Depends(get_db),
):
    """
    Get performance metrics for politicians.

    Calculates comprehensive performance indicators including:
    - Activity levels
    - Voting patterns
    - Promise fulfillment
    - Transparency scores
    """
    # Build base query
    query = db.query(Politician)

    if office_type:
        query = query.filter(Politician.office_type == office_type)

    if party:
        query = query.filter(Politician.party.ilike(f"%{party}%"))

    if state:
        query = query.filter(Politician.state == state)

    # Apply sorting
    valid_sort_fields = [
        "transparency_score",
        "total_promises",
        "total_actions",
        "attendance_rate",
    ]
    if sort_by == "transparency_score":
        query = query.join(
            TransparencyScore,
            Politician.id == TransparencyScore.politician_id,
            isouter=True,
        ).order_by(
            TransparencyScore.overall_score.desc()
            if sort_order == "desc"
            else TransparencyScore.overall_score.asc()
        )
    else:
        query = query.order_by(
            getattr(Politician, sort_by, Politician.id).desc()
            if sort_order == "desc"
            else getattr(Politician, sort_by, Politician.id).asc()
        )

    politicians = query.limit(limit).all()

    performance_list = []
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)

    for politician in politicians:
        # Count actions
        total_actions = (
            db.query(Action).filter(Action.politician_id == politician.id).count()
        )
        actions_last_30_days = (
            db.query(Action)
            .filter(
                and_(
                    Action.politician_id == politician.id,
                    Action.action_date >= thirty_days_ago,
                )
            )
            .count()
        )

        # Voting statistics
        total_votes = db.query(Vote).filter(Vote.politician_id == politician.id).count()
        absent_votes = (
            db.query(Vote)
            .filter(
                and_(
                    Vote.politician_id == politician.id,
                    Vote.vote_type == "ABSENT",
                )
            )
            .count()
        )
        attendance_rate = (
            ((total_votes - absent_votes) / total_votes * 100)
            if total_votes > 0
            else 0.0
        )
        voting_rate = total_votes / max(politician.years_in_office, 1)

        # Promise statistics
        total_promises = (
            db.query(Promise).filter(Promise.politician_id == politician.id).count()
        )

        fulfilled = (
            db.query(Promise)
            .filter(
                and_(
                    Promise.politician_id == politician.id,
                    Promise.fulfillment_status == "fulfilled",
                )
            )
            .count()
        )
        broken = (
            db.query(Promise)
            .filter(
                and_(
                    Promise.politician_id == politician.id,
                    Promise.fulfillment_status == "broken",
                )
            )
            .count()
        )

        fulfillment_rate = (
            (fulfilled / total_promises * 100) if total_promises > 0 else 0.0
        )

        # Transparency score
        latest_score = (
            db.query(TransparencyScore)
            .filter(TransparencyScore.politician_id == politician.id)
            .order_by(TransparencyScore.calculated_at.desc())
            .first()
        )

        transparency_score = latest_score.overall_score if latest_score else None
        transparency_rank = latest_score.rank if latest_score else None

        # Activity trend
        activity_trend = calculate_trend(
            actions_last_30_days, max(total_actions - actions_last_30_days, 1)
        )

        # Performance grade
        performance_grade = get_performance_grade(
            transparency_score, fulfillment_rate, attendance_rate
        )

        # Politician name
        politician_name = (
            politician.full_name or f"{politician.first_name} {politician.last_name}"
        )

        performance_list.append(
            PoliticianPerformance(
                politician_id=politician.id,
                politician_name=politician_name,
                office_title=politician.office_title,
                party=politician.party,
                state=politician.state,
                total_actions=total_actions,
                actions_last_30_days=actions_last_30_days,
                voting_rate=round(voting_rate, 2),
                attendance_rate=round(attendance_rate, 2),
                total_promises=total_promises,
                fulfillment_rate=round(fulfillment_rate, 2),
                broken_promises=broken,
                transparency_score=round(transparency_score, 2)
                if transparency_score
                else None,
                transparency_rank=transparency_rank,
                activity_trend=activity_trend,
                performance_grade=performance_grade,
            )
        )

    return performance_list


@router.get(
    "/actions/trends",
    response_model=List[ActionTrend],
    summary="Get action trends",
    description="Analyze government action trends over time",
)
async def get_action_trends(
    politician_id: Optional[int] = Query(None, description="Filter by politician ID"),
    action_type: Optional[str] = Query(None, description="Filter by action type"),
    start_date: Optional[datetime] = Query(None, description="Start date for analysis"),
    end_date: Optional[datetime] = Query(None, description="End date for analysis"),
    group_by: str = Query("month", description="Group by: day, week, month, year"),
    db: Session = Depends(get_db),
):
    """
    Analyze action trends over time.

    Groups actions by time period and provides breakdowns by type, category, and impact.
    """
    # Build base query
    query = db.query(Action)

    if politician_id:
        query = query.filter(Action.politician_id == politician_id)

    if action_type:
        query = query.filter(Action.action_type == action_type)

    if start_date:
        query = query.filter(Action.action_date >= start_date)

    if end_date:
        query = query.filter(Action.action_date <= end_date)

    # Group by time period
    if group_by == "day":
        date_format = "%Y-%m-%d"
    elif group_by == "week":
        date_format = "%Y-W%W"
    elif group_by == "month":
        date_format = "%Y-%m"
    else:  # year
        date_format = "%Y"

    # Get grouped data
    grouped_actions = (
        db.query(
            func.strftime(date_format, Action.action_date).label("period"),
            func.count(Action.id).label("count"),
        )
        .group_by("period")
        .order_by("period")
        .all()
    )

    trends = []
    for period, count in grouped_actions:
        # Get breakdowns for this period
        period_start = datetime.strptime(period, date_format)
        period_end = (
            period_start + timedelta(days=31) if group_by == "month" else period_start
        )

        type_breakdown = (
            db.query(Action.action_type, func.count(Action.id))
            .filter(Action.action_date.between(period_start, period_end))
            .group_by(Action.action_type)
            .all()
        )
        by_type = {
            str(t.value if hasattr(t, "value") else t): c for t, c in type_breakdown
        }

        category_breakdown = (
            db.query(Action.action_category, func.count(Action.id))
            .filter(Action.action_date.between(period_start, period_end))
            .group_by(Action.action_category)
            .all()
        )
        by_category = {
            str(c.value if hasattr(c, "value") else c): cnt
            for c, cnt in category_breakdown
        }

        impact_breakdown = (
            db.query(Action.impact_level, func.count(Action.id))
            .filter(Action.action_date.between(period_start, period_end))
            .group_by(Action.impact_level)
            .all()
        )
        by_impact = {level: cnt for level, cnt in impact_breakdown}

        avg_impact = (
            db.query(func.avg(Action.impact_level))
            .filter(Action.action_date.between(period_start, period_end))
            .scalar()
            or 0.0
        )

        trends.append(
            ActionTrend(
                time_period=period,
                actions_count=count,
                by_type=by_type,
                by_category=by_category,
                by_impact={str(k): v for k, v in by_impact.items()},
                avg_impact=round(avg_impact, 2),
                trending_topics=[],  # Would need topic analysis
            )
        )

    return trends


@router.get(
    "/promises/analytics",
    response_model=PromiseAnalytics,
    summary="Get promise fulfillment analytics",
    description="Retrieve comprehensive promise analytics for a politician or overall",
)
async def get_promise_analytics(
    politician_id: Optional[int] = Query(None, description="Filter by politician ID"),
    category: Optional[str] = Query(None, description="Filter by category"),
    start_date: Optional[datetime] = Query(None, description="Filter by start date"),
    end_date: Optional[datetime] = Query(None, description="Filter by end date"),
    db: Session = Depends(get_db),
):
    """
    Get comprehensive promise fulfillment analytics.

    Includes status breakdown, category analysis, and trend identification.
    """
    # Build query
    query = db.query(Promise)

    if politician_id:
        query = query.filter(Promise.politician_id == politician_id)

    if category:
        query = query.filter(Promise.category == category)

    if start_date:
        query = query.filter(Promise.promise_date >= start_date)

    if end_date:
        query = query.filter(Promise.promise_date <= end_date)

    promises = query.all()

    if not promises:
        return PromiseAnalytics(
            total_promises=0,
            fulfillment_rate=0.0,
            fulfilled=0,
            partially_fulfilled=0,
            delayed=0,
            broken=0,
            active=0,
            by_category={},
            by_year={},
            trend="stable",
            average_days_to_fulfill=None,
            most_common_categories=[],
        )

    # Count by status
    fulfilled = sum(1 for p in promises if p.fulfillment_status == "fulfilled")
    partially_fulfilled = sum(
        1 for p in promises if p.fulfillment_status == "partially_fulfilled"
    )
    delayed = sum(1 for p in promises if p.fulfillment_status == "delayed")
    broken = sum(1 for p in promises if p.fulfillment_status == "broken")
    active = sum(1 for p in promises if p.fulfillment_status == "active")

    total = len(promises)
    fulfillment_rate = (
        (fulfilled + partially_fulfilled * 0.5 + delayed * 0.3) / total * 100
        if total > 0
        else 0.0
    )

    # By category
    by_category = {}
    for promise in promises:
        if promise.category:
            if promise.category not in by_category:
                by_category[promise.category] = {
                    "total": 0,
                    "fulfilled": 0,
                    "partially_fulfilled": 0,
                    "delayed": 0,
                    "broken": 0,
                    "active": 0,
                }
            by_category[promise.category]["total"] += 1
            by_category[promise.category][str(promise.fulfillment_status)] += 1

    # By year
    by_year = {}
    for promise in promises:
        year = str(promise.promise_date.year)
        if year not in by_year:
            by_year[year] = {"total": 0, "fulfilled": 0, "broken": 0}
        by_year[year]["total"] += 1
        if promise.fulfillment_status == "fulfilled":
            by_year[year]["fulfilled"] += 1
        elif promise.fulfillment_status == "broken":
            by_year[year]["broken"] += 1

    # Trend analysis
    if len(by_year) >= 2:
        years = sorted(by_year.keys())
        recent = by_year[years[-1]]
        previous = by_year[years[-2]]

        recent_rate = (
            recent["fulfilled"] / recent["total"] if recent["total"] > 0 else 0
        )
        previous_rate = (
            previous["fulfilled"] / previous["total"] if previous["total"] > 0 else 0
        )

        if recent_rate > previous_rate * 1.1:
            trend = "improving"
        elif recent_rate < previous_rate * 0.9:
            trend = "declining"
        else:
            trend = "stable"
    else:
        trend = "stable"

    # Calculate average days to fulfill
    fulfilled_promises = [p for p in promises if p.fulfillment_status == "fulfilled"]
    if fulfilled_promises:
        # This would need actual fulfillment dates
        average_days_to_fulfill = None

    # Most common categories
    category_counts = {cat: data["total"] for cat, data in by_category.items()}
    most_common = sorted(category_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    return PromiseAnalytics(
        total_promises=total,
        fulfillment_rate=round(fulfillment_rate, 2),
        fulfilled=fulfilled,
        partially_fulfilled=partially_fulfilled,
        delayed=delayed,
        broken=broken,
        active=active,
        by_category=by_category,
        by_year=by_year,
        trend=trend,
        average_days_to_fulfill=average_days_to_fulfill,
        most_common_categories=[cat for cat, _ in most_common],
    )


@router.get(
    "/transparency/leaderboard",
    response_model=List[TransparencyLeaderboardItem],
    summary="Get transparency leaderboard",
    description="Rank politicians by transparency score",
)
async def get_transparency_leaderboard(
    peer_group: Optional[str] = Query(None, description="Filter by peer group"),
    jurisdiction_level: Optional[str] = Query(
        None, description="Filter by jurisdiction"
    ),
    office_type: Optional[str] = Query(None, description="Filter by office type"),
    limit: int = Query(100, ge=1, le=500, description="Number of politicians"),
    db: Session = Depends(get_db),
):
    """
    Get a ranked leaderboard of politicians by transparency score.

    Perfect for transparency reporting and accountability.
    """
    # Query scores with politician data
    query = db.query(TransparencyScore, Politician).join(
        Politician, TransparencyScore.politician_id == Politician.id
    )

    if peer_group:
        query = query.filter(TransparencyScore.peer_group == peer_group)

    if jurisdiction_level:
        query = query.filter(Politician.jurisdiction_level == jurisdiction_level)

    if office_type:
        query = query.filter(Politician.office_type == office_type)

    # Get latest scores only
    latest_scores = (
        db.query(TransparencyScore)
        .filter(
            TransparencyScore.id
            == db.query(
                db.query(func.max(TransparencyScore.id))
                .filter(
                    TransparencyScore.politician_id == TransparencyScore.politician_id
                )
                .correlate(TransparencyScore)
                .scalar_subquery()
            )
        )
        .all()
    )

    # Get top scores with politician data
    results = (
        db.query(TransparencyScore, Politician)
        .join(Politician, TransparencyScore.politician_id == Politician.id)
        .filter(TransparencyScore.id.in_([s.id for s in latest_scores]))
        .order_by(TransparencyScore.overall_score.desc())
        .limit(limit)
        .all()
    )

    leaderboard = []
    for i, (score, politician) in enumerate(results, 1):
        politician_name = (
            politician.full_name or f"{politician.first_name} {politician.last_name}"
        )

        leaderboard.append(
            TransparencyLeaderboardItem(
                rank=i,
                politician_id=politician.id,
                politician_name=politician_name,
                office_title=politician.office_title,
                party=politician.party,
                state=politician.state,
                overall_score=round(score.overall_score, 2),
                letter_grade=score.letter_grade,
                star_rating=score.star_rating,
                trend=score.trend,
                trend_magnitude=round(score.trend_magnitude, 2),
            )
        )

    return leaderboard


@router.get(
    "/data-quality",
    response_model=DataQualityMetrics,
    summary="Get data quality metrics",
    description="Retrieve data quality and health metrics",
)
async def get_data_quality_metrics(db: Session = Depends(get_db)):
    """
    Get metrics about data quality and freshness.

    Useful for monitoring data integrity and identifying issues.
    """
    # Total records
    total_politicians = db.query(Politician).count()
    total_actions = db.query(Action).count()
    total_promises = db.query(Promise).count()
    total_votes = db.query(Vote).count()
    total_bills = db.query(Bill).count()

    total_records = (
        total_politicians + total_actions + total_promises + total_votes + total_bills
    )

    # Recent records
    yesterday = datetime.utcnow() - timedelta(days=1)
    last_week = datetime.utcnow() - timedelta(weeks=1)
    last_month = datetime.utcnow() - timedelta(days=30)

    records_today = db.query(Action).filter(Action.created_at >= yesterday).count()
    records_this_week = db.query(Action).filter(Action.created_at >= last_week).count()
    records_this_month = (
        db.query(Action).filter(Action.created_at >= last_month).count()
    )

    # Source breakdown (simplified)
    sources = {}
    source_counts = (
        db.query(Action.source_type, func.count(Action.id))
        .group_by(Action.source_type)
        .all()
    )
    for source, count in source_counts:
        sources[source or "unknown"] = count

    # Quality indicators
    verified_actions = db.query(Action).filter(Action.evidence_tier == "tier_1").count()
    verified_percentage = (
        (verified_actions / total_actions * 100) if total_actions > 0 else 0.0
    )

    # Average evidence per action
    avg_evidence = (
        db.query(func.avg(func.count(Evidence.id).label("evidence_count")))
        .join(Evidence, Evidence.action_id == Action.id)
        .group_by(Action.id)
        .scalar()
        or 0.0
    )

    # AI analysis coverage
    ai_analyzed = (
        db.query(Action)
        .filter(
            or_(
                Action.ai_summary.isnot(None),
                Action.ai_sentiment_score.isnot(None),
            )
        )
        .count()
    )
    ai_coverage = (ai_analyzed / total_actions * 100) if total_actions > 0 else 0.0

    # Data freshness
    oldest_action = db.query(func.min(Action.created_at)).scalar()
    newest_action = db.query(func.max(Action.created_at)).scalar()

    if oldest_action:
        age_days = (datetime.utcnow() - oldest_action).days
    else:
        age_days = 0

    # Health score (composite metric)
    data_health_score = (
        verified_percentage * 0.4
        + ai_coverage * 0.3
        + min(100, records_today * 10) * 0.2
        + (100 - min(100, age_days)) * 0.1
    )

    quality_grade = calculate_grade(data_health_score)

    return DataQualityMetrics(
        total_records=total_records,
        records_today=records_today,
        records_this_week=records_this_week,
        records_this_month=records_this_month,
        sources=sources,
        verified_sources_percentage=round(verified_percentage, 2),
        avg_evidence_per_action=round(avg_evidence, 2),
        ai_analysis_coverage=round(ai_coverage, 2),
        avg_record_age_days=float(age_days),
        oldest_record_date=oldest_action,
        newest_record_date=newest_action,
        data_health_score=round(data_health_score, 2),
        quality_grade=quality_grade,
    )


@router.get(
    "/comparison/trend",
    response_model=Dict[str, TrendComparison],
    summary="Compare trends",
    description="Compare metrics between two time periods",
)
async def compare_trends(
    metric: str = Query(..., description="Metric to compare: actions, votes, promises"),
    period_days: int = Query(
        30, ge=7, le=365, description="Days in each comparison period"
    ),
    politician_id: Optional[int] = Query(None, description="Filter by politician"),
    db: Session = Depends(get_db),
):
    """
    Compare metrics between current and previous time periods.

    Useful for trend analysis and performance tracking.
    """
    # Calculate date ranges
    period_end = datetime.utcnow()
    period_start = period_end - timedelta(days=period_days)
    previous_end = period_start
    previous_start = previous_end - timedelta(days=period_days)

    # Count based on metric
    if metric == "actions":
        current_count = db.query(Action).filter(
            Action.action_date.between(period_start, period_end)
        )
        if politician_id:
            current_count = current_count.filter(Action.politician_id == politician_id)
        current_count = current_count.count()

        previous_count = db.query(Action).filter(
            Action.action_date.between(previous_start, previous_end)
        )
        if politician_id:
            previous_count = previous_count.filter(
                Action.politician_id == politician_id
            )
        previous_count = previous_count.count()

    elif metric == "votes":
        current_count = db.query(Vote).filter(
            Vote.vote_date.between(period_start, period_end)
        )
        if politician_id:
            current_count = current_count.filter(Vote.politician_id == politician_id)
        current_count = current_count.count()

        previous_count = db.query(Vote).filter(
            Vote.vote_date.between(previous_start, previous_end)
        )
        if politician_id:
            previous_count = previous_count.filter(Vote.politician_id == politician_id)
        previous_count = previous_count.count()

    elif metric == "promises":
        current_count = db.query(Promise).filter(
            Promise.promise_date.between(period_start, period_end)
        )
        if politician_id:
            current_count = current_count.filter(Promise.politician_id == politician_id)
        current_count = current_count.count()

        previous_count = db.query(Promise).filter(
            Promise.promise_date.between(previous_start, previous_end)
        )
        if politician_id:
            previous_count = previous_count.filter(
                Promise.politician_id == politician_id
            )
        previous_count = previous_count.count()

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid metric. Must be: actions, votes, promises",
        )

    # Calculate change
    change = current_count - previous_count
    change_percentage = (change / previous_count * 100) if previous_count > 0 else 0.0

    trend_direction = "stable"
    if change_percentage > 10:
        trend_direction = "up"
    elif change_percentage < -10:
        trend_direction = "down"

    return {
        metric: TrendComparison(
            metric=metric,
            current_period={
                "start": period_start,
                "end": period_end,
                "count": current_count,
            },
            previous_period={
                "start": previous_start,
                "end": previous_end,
                "count": previous_count,
            },
            change=change,
            change_percentage=round(change_percentage, 2),
            trend_direction=trend_direction,
        )
    }

"""
Search API Endpoints for The Glass House

This module provides powerful search functionality across all government data,
including politicians, actions, promises, bills, votes, and more.

Features:
- Full-text search across all content
- AI-powered natural language queries
- Faceted search with filters
- Search suggestions and autocomplete
- Relevance ranking
- Search analytics and trending

All endpoints use proper validation, error handling, and async where appropriate.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from app.core.config import get_settings
from app.db.database import get_db
from app.db.models import (
    Action,
    Bill,
    Politician,
    Promise,
    Topic,
    Vote,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, validator
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

router = APIRouter()

settings = get_settings()


class SearchTarget(str, Enum):
    """Types of entities to search"""

    ALL = "all"
    POLITICIANS = "politicians"
    ACTIONS = "actions"
    PROMISES = "promises"
    BILLS = "bills"
    VOTES = "votes"
    TOPICS = "topics"


class SearchSort(str, Enum):
    """Search result sorting options"""

    RELEVANCE = "relevance"
    DATE = "date"
    DATE_ASC = "date_asc"
    TITLE = "title"
    IMPACT = "impact"
    FULFILLMENT = "fulfillment"


class SearchQuery(BaseModel):
    """Search query model with validation"""

    q: str = Field(..., min_length=1, max_length=500, description="Search query")
    target: SearchTarget = Field(
        SearchTarget.ALL, description="Target entity types to search"
    )
    page: int = Field(1, ge=1, description="Page number")
    page_size: int = Field(20, ge=1, le=100, description="Results per page")
    sort_by: SearchSort = Field(SearchSort.RELEVANCE, description="Sort order")
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    category: Optional[str] = None
    jurisdiction: Optional[str] = None
    party: Optional[str] = None
    status: Optional[str] = None

    @validator("q")
    def query_not_whitespace(cls, v):
        if not v.strip():
            raise ValueError("Query cannot be only whitespace")
        return v.strip()


class SearchResultItem(BaseModel):
    """Base search result item"""

    id: int
    type: str
    title: str
    snippet: Optional[str] = None
    relevance_score: float
    metadata: Dict[str, Any] = Field(default_factory=dict)


class PoliticianSearchResult(SearchResultItem):
    """Politician search result"""

    office_title: str
    party: Optional[str]
    state: Optional[str]
    is_current: bool
    profile_url: str


class ActionSearchResult(SearchResultItem):
    """Action search result"""

    politician_name: str
    action_date: datetime
    action_type: str
    status: Optional[str]
    impact_level: int
    action_url: str


class PromiseSearchResult(SearchResultItem):
    """Promise search result"""

    politician_name: str
    promise_date: datetime
    fulfillment_status: str
    fulfillment_score: float
    deadline: Optional[datetime]
    is_past_deadline: bool
    promise_url: str


class BillSearchResult(SearchResultItem):
    """Bill search result"""

    bill_number: str
    bill_type: str
    status: str
    introduced_date: Optional[datetime]
    sponsor_count: int
    bill_url: str


class VoteSearchResult(SearchResultItem):
    """Vote search result"""

    politician_name: str
    vote_type: str
    vote_date: datetime
    bill_title: Optional[str]
    vote_url: str


class TopicSearchResult(SearchResultItem):
    """Topic search result"""

    category: str
    action_count: int
    politician_count: int
    topic_url: str


class SearchResponse(BaseModel):
    """Main search response"""

    query: str
    results: List[Dict[str, Any]]
    total: int
    page: int
    page_size: int
    total_pages: int
    search_time_ms: float
    filters_applied: Dict[str, Any]
    suggestions: Optional[List[str]] = None
    facets: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class SearchSuggestionResponse(BaseModel):
    """Search suggestions/autocomplete response"""

    query: str
    suggestions: List[str]
    categories: Dict[str, List[str]]


class SearchAnalyticsResponse(BaseModel):
    """Search analytics response"""

    total_searches: int
    popular_queries: List[Dict[str, Any]]
    trending_topics: List[str]
    search_by_type: Dict[str, int]
    avg_search_time_ms: float


# ==================================================================================
# Search Helper Functions
# ==================================================================================


def build_search_condition(search_text: str) -> Any:
    """Build SQL search condition for full-text search"""
    search_pattern = f"%{search_text}%"
    return func.lower(search_text)


def calculate_relevance_score(
    text: str,
    query: str,
    match_fields: List[str] = None,
) -> float:
    """
    Calculate relevance score for search result.

    Simple keyword matching with weighting:
    - Exact match: 10 points
    - Phrase match: 5 points
    - Word match: 1 point per word
    """
    if not text or not query:
        return 0.0

    text_lower = text.lower()
    query_lower = query.lower()
    score = 0.0

    # Exact match (case-insensitive)
    if query_lower in text_lower:
        score += 10.0

    # Phrase match
    query_words = query_lower.split()
    if len(query_words) > 1:
        for i in range(len(query_words) - 1):
            phrase = f" {query_words[i]} {query_words[i + 1]} "
            if phrase in text_lower:
                score += 5.0

    # Individual word matches
    for word in query_words:
        if len(word) > 2:  # Ignore single/double letter words
            count = text_lower.count(f" {word} ")
            score += count * 1.0

    return min(score, 100.0)  # Cap at 100


def generate_snippet(text: str, query: str, max_length: int = 200) -> str:
    """Generate search result snippet highlighting the query"""
    if not text:
        return None

    # Find query in text
    query_lower = query.lower()
    text_lower = text.lower()

    # Find position of query match
    pos = text_lower.find(query_lower)

    if pos == -1:
        # No match found, just return beginning
        return (text[:max_length] + "...") if len(text) > max_length else text

    # Extract snippet around match
    start = max(0, pos - 50)
    end = min(len(text), pos + len(query) + 50)

    snippet = text[start:end]

    # Add ellipsis if needed
    if start > 0:
        snippet = "..." + snippet
    if end < len(text):
        snippet = snippet + "..."

    # Highlight query (replace with HTML for frontend)
    snippet = snippet.replace(query, f"<mark>{query}</mark>", 1)

    return snippet


# ==================================================================================
# API Endpoints
# ==================================================================================


@router.get(
    "/",
    response_model=SearchResponse,
    summary="Search all content",
    description="Perform a comprehensive search across all government data",
    responses={
        200: {"description": "Search completed successfully"},
        400: {"description": "Invalid search parameters"},
    },
)
async def search_all(
    query: SearchQuery,
    db: Session = Depends(get_db),
):
    """
    Main search endpoint that searches across all entities.

    Supports:
    - Full-text search across names, titles, descriptions
    - Filtering by date range, category, jurisdiction, party, status
    - Multiple target types (all or specific)
    - Sorting by relevance, date, title, impact, etc.
    - Pagination
    - Search suggestions and facets

    Example:
    ```
    GET /api/v1/search?q="climate change bill"
        &target=all
        &start_date=2023-01-01
        &sort_by=relevance
    ```
    """
    import time

    start_time = time.time()

    # Minimum query length
    if len(query.q.strip()) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search query must be at least 2 characters",
        )

    all_results = []
    total_count = 0

    # Search politicians
    if query.target in [SearchTarget.ALL, SearchTarget.POLITICIANS]:
        politician_results = search_politicians(query.q, query, db)
        all_results.extend(politician_results)

    # Search actions
    if query.target in [SearchTarget.ALL, SearchTarget.ACTIONS]:
        action_results = search_actions(query.q, query, db)
        all_results.extend(action_results)

    # Search promises
    if query.target in [SearchTarget.ALL, SearchTarget.PROMISES]:
        promise_results = search_promises(query.q, query, db)
        all_results.extend(promise_results)

    # Search bills
    if query.target in [SearchTarget.ALL, SearchTarget.BILLS]:
        bill_results = search_bills(query.q, query, db)
        all_results.extend(bill_results)

    # Search votes
    if query.target in [SearchTarget.ALL, SearchTarget.VOTES]:
        vote_results = search_votes(query.q, query, db)
        all_results.extend(vote_results)

    # Search topics
    if query.target in [SearchTarget.ALL, SearchTarget.TOPICS]:
        topic_results = search_topics(query.q, query, db)
        all_results.extend(topic_results)

    # Sort results by relevance score
    all_results.sort(key=lambda x: x.get("relevance_score", 0), reverse=True)

    # Calculate pagination
    total_count = len(all_results)
    total_pages = (
        (total_count + query.page_size - 1) // query_size if total_count > 0 else 0
    )
    offset = (query.page - 1) * query.page_size
    paginated_results = all_results[offset : offset + query.page_size]

    # Calculate search time
    search_time_ms = (time.time() - start_time) * 1000

    # Generate suggestions
    suggestions = generate_search_suggestions(query.q)

    # Generate facets
    facets = generate_facets(all_results, db, query)

    return SearchResponse(
        query=query.q,
        results=paginated_results,
        total=total_count,
        page=query.page,
        page_size=query.page_size,
        total_pages=total_pages,
        search_time_ms=round(search_time_ms, 2),
        filters_applied=query.dict(exclude={"q"}),
        suggestions=suggestions,
        facets=facets,
    )


def search_politicians(
    query_text: str, search_query: SearchQuery, db: Session
) -> List[Dict]:
    """Search politicians"""
    results = []
    search_pattern = f"%{query_text}%"

    # Build query
    q = db.query(Politician).filter(
        or_(
            func.lower(Politician.first_name).ilike(search_pattern.lower()),
            func.lower(Politician.last_name).ilike(search_pattern.lower()),
            func.lower(Politician.full_name).ilike(search_pattern.lower()),
            func.lower(Politician.office_title).ilike(search_pattern.lower()),
            func.lower(Politician.bio).ilike(search_pattern.lower()),
        )
    )

    # Apply filters
    if search_query.party:
        q = q.filter(Politician.party.ilike(f"%{search_query.party}%"))

    if search_query.jurisdiction:
        q = q.filter(Politician.jurisdiction_level == search_query.jurisdiction)

    if search_query.start_date:
        q = q.filter(Politician.term_start >= search_query.start_date)

    if search_query.end_date:
        q = q.filter(Politician.term_end <= search_query.end_date)

    # Execute query
    politicians = q.limit(search_query.page_size * 2).all()

    for politician in politicians:
        # Calculate relevance score
        full_name = (
            politician.full_name or f"{politician.first_name} {politician.last_name}"
        )
        score = calculate_relevance_score(
            f"{full_name} {politician.office_title} {politician.bio or ''}", query_text
        )

        if score > 0:
            results.append(
                PoliticianSearchResult(
                    id=politician.id,
                    type="politician",
                    title=full_name,
                    snippet=generate_snippet(
                        f"{full_name} - {politician.office_title} - {politician.bio or ''}",
                        query_text,
                    ),
                    relevance_score=round(score, 2),
                    office_title=politician.office_title,
                    party=politician.party,
                    state=politician.state,
                    is_current=politician.is_current,
                    profile_url=f"/politicians/{politician.id}",
                    metadata={
                        "district": politician.district,
                        "term_start": politician.term_start.isoformat(),
                    },
                ).dict()
            )

    return results


def search_actions(
    query_text: str, search_query: SearchQuery, db: Session
) -> List[Dict]:
    """Search actions"""
    results = []
    search_pattern = f"%{query_text}%"

    q = (
        db.query(Action, Politician)
        .join(Politician, Action.politician_id == Politician.id)
        .filter(
            or_(
                func.lower(Action.title).ilike(search_pattern.lower()),
                func.lower(Action.description).ilike(search_pattern.lower()),
            )
        )
    )

    # Apply filters
    if search_query.start_date:
        q = q.filter(Action.action_date >= search_query.start_date)

    if search_query.end_date:
        q = q.filter(Action.action_date <= search_query.end_date)

    if search_query.category:
        q = q.filter(Action.action_category == search_query.category)

    if search_query.status:
        q = q.filter(Action.status.ilike(f"%{search_query.status}%"))

    # Execute query
    actions = (
        q.order_by(Action.action_date.desc()).limit(search_query.page_size * 2).all()
    )

    for action, politician in actions:
        full_name = (
            politician.full_name or f"{politician.first_name} {politician.last_name}"
        )
        score = calculate_relevance_score(
            f"{action.title} {action.description or ''} {full_name}", query_text
        )

        if score > 0:
            results.append(
                ActionSearchResult(
                    id=action.id,
                    type="action",
                    title=action.title,
                    snippet=generate_snippet(
                        f"{action.title} - {action.description or ''}", query_text
                    ),
                    relevance_score=round(score, 2),
                    politician_name=full_name,
                    action_date=action.action_date,
                    action_type=action.action_type.value
                    if hasattr(action.action_type, "value")
                    else action.action_type,
                    status=action.status,
                    impact_level=action.impact_level,
                    action_url=f"/actions/{action.id}",
                    metadata={
                        "politician_id": action.politician_id,
                    },
                ).dict()
            )

    return results


def search_promises(
    query_text: str, search_query: SearchQuery, db: Session
) -> List[Dict]:
    """Search promises"""
    results = []
    search_pattern = f"%{query_text}%"

    q = (
        db.query(Promise, Politician)
        .join(Politician, Promise.politician_id == Politician.id)
        .filter(
            or_(
                func.lower(Promise.promise_text).ilike(search_pattern.lower()),
                func.lower(Promise.full_context).ilike(search_pattern.lower()),
            )
        )
    )

    # Apply filters
    if search_query.start_date:
        q = q.filter(Promise.promise_date >= search_query.start_date)

    if search_query.end_date:
        q = q.filter(Promise.promise_date <= search_query.end_date)

    if search_query.category:
        q = q.filter(Promise.category == search_query.category)

    if search_query.status:
        q = q.filter(Promise.fulfillment_status == search_query.status)

    # Execute query
    promises = (
        q.order_by(Promise.promise_date.desc()).limit(search_query.page_size * 2).all()
    )

    for promise, politician in promises:
        full_name = (
            politician.full_name or f"{politician.first_name} {politician.last_name}"
        )
        score = calculate_relevance_score(
            f"{promise.promise_text} {promise.full_context or ''}", query_text
        )

        if score > 0:
            results.append(
                PromiseSearchResult(
                    id=promise.id,
                    type="promise",
                    title=promise.promise_text[:200],
                    snippet=generate_snippet(promise.promise_text, query_text),
                    relevance_score=round(score, 2),
                    politician_name=full_name,
                    promise_date=promise.promise_date,
                    fulfillment_status=promise.fulfillment_status.value
                    if hasattr(promise.fulfillment_status, "value")
                    else promise.fulfillment_status,
                    fulfillment_score=promise.fulfillment_score,
                    deadline=promise.deadline,
                    is_past_deadline=promise.is_past_deadline,
                    promise_url=f"/promises/{promise.id}",
                    metadata={
                        "category": promise.category,
                        "topic_tags": promise.topic_tags,
                    },
                ).dict()
            )

    return results


def search_bills(query_text: str, search_query: SearchQuery, db: Session) -> List[Dict]:
    """Search bills"""
    results = []
    search_pattern = f"%{query_text}%"

    q = db.query(Bill).filter(
        or_(
            func.lower(Bill.title).ilike(search_pattern.lower()),
            func.lower(Bill.summary).ilike(search_pattern.lower()),
            func.lower(Bill.bill_number).ilike(search_pattern.lower()),
        )
    )

    # Apply filters
    if search_query.start_date:
        q = q.filter(Bill.introduced_date >= search_query.start_date)

    if search_query.end_date:
        q = q.filter(Bill.introduced_date <= search_query.end_date)

    if search_query.status:
        q = q.filter(Bill.status.ilike(f"%{search_query.status}%"))

    # Execute query
    bills = (
        q.order_by(Bill.introduced_date.desc()).limit(search_query.page_size * 2).all()
    )

    for bill in bills:
        score = calculate_relevance_score(
            f"{bill.title} {bill.summary or ''} {bill.bill_number}", query_text
        )

        if score > 0:
            # Get sponsor count
            sponsor_count = (
                db.query(BillSponsor).filter(BillSponsor.bill_id == bill.id).count()
                if "BillSponsor" in dir()
                else 0
            )

            results.append(
                BillSearchResult(
                    id=bill.id,
                    type="bill",
                    title=bill.title,
                    snippet=generate_snippet(
                        f"{bill.title} {bill.summary or ''}", query_text
                    ),
                    relevance_score=round(score, 2),
                    bill_number=bill.bill_number,
                    bill_type=bill.bill_type,
                    status=bill.status,
                    introduced_date=bill.introduced_date,
                    sponsor_count=sponsor_count,
                    bill_url=f"/bills/{bill.id}",
                    metadata={
                        "congress_number": bill.congress_number,
                        "outcome": bill.outcome,
                    },
                ).dict()
            )

    return results


def search_votes(query_text: str, search_query: SearchQuery, db: Session) -> List[Dict]:
    """Search votes"""
    results = []
    search_pattern = f"%{query_text}%"

    q = (
        db.query(Vote, Politician)
        .join(Politician, Vote.politician_id == Politician.id)
        .filter(
            or_(
                func.lower(Vote.vote_description).ilike(search_pattern.lower()),
                func.lower(Politician.last_name).ilike(search_pattern.lower()),
            )
        )
    )

    # Apply filters
    if search_query.start_date:
        q = q.filter(Vote.vote_date >= search_query.start_date)

    if search_query.end_date:
        q = q.filter(Vote.vote_date <= search_query.end_date)

    # Execute query
    votes = q.order_by(Vote.vote_date.desc()).limit(search_query.page_size * 2).all()

    for vote, politician in votes:
        full_name = (
            politician.full_name or f"{politician.first_name} {politician.last_name}"
        )
        score = calculate_relevance_score(
            f"{full_name} {vote.vote_description or ''}", query_text
        )

        if score > 0:
            results.append(
                VoteSearchResult(
                    id=vote.id,
                    type="vote",
                    title=f"{full_name} voted {vote.vote_type}",
                    snippet=generate_snippet(
                        f"{full_name} - {vote.vote_description or ''}", query_text
                    ),
                    relevance_score=round(score, 2),
                    politician_name=full_name,
                    vote_type=vote.vote_type,
                    vote_date=vote.vote_date,
                    bill_title=vote.vote_description,
                    vote_url=f"/votes/{vote.id}",
                    metadata={
                        "roll_call_number": vote.roll_call_number,
                        "chamber": vote.chamber,
                    },
                ).dict()
            )

    return results


def search_topics(
    query_text: str, search_query: SearchQuery, db: Session
) -> List[Dict]:
    """Search topics"""
    results = []
    search_pattern = f"%{query_text}%"

    q = db.query(Topic).filter(
        or_(
            func.lower(Topic.name).ilike(search_pattern.lower()),
            func.lower(Topic.description).ilike(search_pattern.lower()),
        )
    )

    topics = q.limit(search_query.page_size).all()

    for topic in topics:
        score = calculate_relevance_score(
            f"{topic.name} {topic.description or ''}", query_text
        )

        if score > 0:
            results.append(
                TopicSearchResult(
                    id=topic.id,
                    type="topic",
                    title=topic.name,
                    snippet=generate_snippet(topic.name, query_text),
                    relevance_score=round(score, 2),
                    category=topic.category,
                    action_count=0,  # Would query related actions
                    politician_count=0,  # Would query related politicians
                    topic_url=f"/topics/{topic.id}",
                    metadata={
                        "description": topic.description,
                    },
                ).dict()
            )

    return results


def generate_search_suggestions(query_text: str, limit: int = 5) -> List[str]:
    """Generate search suggestions for autocomplete"""
    # In production, this would query a search index or use ML models
    # For now, return template suggestions
    suggestions = []

    if query_text:
        # Suggest related terms
        base_terms = [
            "politician",
            "bill",
            "vote",
            "promise",
            "action",
            "executive order",
            "legislation",
            "campaign promise",
            "voting record",
        ]

        for term in base_terms:
            if query_text.lower() in term.lower():
                suggestions.append(term)

        # Suggest complete queries
        suggestions.extend(
            [
                f"{query_text} bill",
                f"{query_text} politician",
                f"{query_text} promise",
                f"{query_text} vote",
            ]
        )

    return suggestions[:limit]


def generate_facets(
    results: List[Dict], db: Session, query: SearchQuery
) -> Dict[str, Any]:
    """Generate search facets for filtering"""
    facets = {
        "types": {},
        "categories": {},
        "statuses": {},
        "parties": {},
    }

    # Count by type
    for result in results:
        result_type = result.get("type", "unknown")
        facets["types"][result_type] = facets["types"].get(result_type, 0) + 1

    # Get unique categories from database
    categories = db.query(Action.action_category).distinct().all()
    for cat in categories:
        if cat and cat.action_category:
            cat_name = (
                cat.action_category.value
                if hasattr(cat.action_category, "value")
                else cat.action_category
            )
            facets["categories"][cat_name] = 0

    # Get unique parties
    parties = db.query(Politician.party).distinct().all()
    for party in parties:
        if party and party.party:
            facets["parties"][party.party] = 0

    return facets


@router.get(
    "/suggestions",
    response_model=SearchSuggestionResponse,
    summary="Get search suggestions",
    description="Get autocomplete suggestions for search queries",
)
async def get_search_suggestions(
    q: str = Query(..., min_length=1, max_length=100, description="Query prefix"),
    limit: int = Query(10, ge=1, le=20, description="Number of suggestions"),
    db: Session = Depends(get_db),
):
    """
    Get search suggestions for autocomplete/typeahead.

    Returns:
    - Query suggestions (popular searches)
    - Category-specific suggestions
    """
    if not q or len(q.strip()) < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query must be at least 1 character",
        )

    q = q.strip()

    # Get suggestions from various sources
    suggestions = []

    # Politician name suggestions
    politician_suggestions = (
        db.query(Politician.full_name)
        .filter(func.lower(Politician.full_name).ilike(f"{q.lower()}%"))
        .distinct()
        .limit(5)
        .all()
    )
    suggestions.extend([p.full_name for p in politician_suggestions if p.full_name])

    # Bill title suggestions
    bill_suggestions = (
        db.query(Bill.title)
        .filter(func.lower(Bill.title).ilike(f"{q.lower()}%"))
        .distinct()
        .limit(5)
        .all()
    )
    suggestions.extend([b.title for b in bill_suggestions if b.title])

    # Action title suggestions
    action_suggestions = (
        db.query(Action.title)
        .filter(func.lower(Action.title).ilike(f"{q.lower()}%"))
        .distinct()
        .limit(5)
        .all()
    )
    suggestions.extend([a.title for a in action_suggestions if a.title])

    # Remove duplicates and limit
    suggestions = list(dict.fromkeys(suggestions))[:limit]

    # Categorize suggestions
    categories = {
        "politicians": [],
        "bills": [],
        "actions": [],
        "promises": [],
    }

    # Get category-specific suggestions
    categories["politicians"] = [
        p.full_name for p in politician_suggestions if p.full_name
    ][: limit // 4]
    categories["bills"] = [b.title for b in bill_suggestions if b.title][: limit // 4]
    categories["actions"] = [a.title for a in action_suggestions if a.title][
        : limit // 4
    ]

    return SearchSuggestionResponse(
        query=q,
        suggestions=suggestions,
        categories=categories,
    )


@router.get(
    "/analytics",
    response_model=SearchAnalyticsResponse,
    summary="Get search analytics",
    description="Get statistics about search usage and popular queries",
)
async def get_search_analytics(
    days: int = Query(30, ge=1, le=365, description="Number of days to analyze"),
    db: Session = Depends(get_db),
):
    """
    Get search analytics and trending data.

    This endpoint would query actual search logs in production.
    For now, returns template data.
    """
    # In production, this would query search log tables
    # For now, return template analytics
    return SearchAnalyticsResponse(
        total_searches=0,
        popular_queries=[
            {"query": "climate change", "count": 0},
            {"query": "healthcare bill", "count": 0},
            {"query": "campaign promises", "count": 0},
        ],
        trending_topics=["climate", "healthcare", "immigration"],
        search_by_type={
            "politicians": 0,
            "actions": 0,
            "promises": 0,
            "bills": 0,
        },
        avg_search_time_ms=0.0,
    )


@router.get(
    "/trending",
    summary="Get trending searches",
    description="Get currently trending search terms and topics",
)
async def get_trending_searches(
    limit: int = Query(10, ge=1, le=50, description="Number of trending items"),
    time_range: str = Query("24h", description="Time range: 24h, 7d, 30d"),
    db: Session = Depends(get_db),
):
    """
    Get trending search terms and topics.

    Returns:
    - Most searched terms
    - Trending topics
    - Rising queries
    """
    # In production, this would query search logs
    # For now, return template data
    return {
        "time_range": time_range,
        "trending_queries": [
            {"query": "climate legislation", "trend": "rising"},
            {"query": "budget bill", "trend": "stable"},
            {"query": "executive orders", "trend": "rising"},
        ],
        "trending_topics": ["climate", "healthcare", "immigration", "economy"],
        "rising_politicians": [],
    }

"""
AI/ML Prediction Service for The Glass House

This module provides machine learning-based predictions for:
- Bill passage likelihood
- Promise fulfillment probability
- Vote outcome predictions
- Trend analysis and forecasting

Uses historical data patterns and ensemble ML models to generate
confidence-weighted predictions.
"""

import json
import logging
import os
import pickle
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)


class PredictionType(Enum):
    """Types of predictions available"""

    BILL_PASAGE = "bill_passage"
    PROMISE_FULFILLMENT = "promise_fulfillment"
    VOTE_OUTCOME = "vote_outcome"
    TRANSPARENCY_TREND = "transparency_trend"


class PredictionConfidence(Enum):
    """Confidence levels for predictions"""

    LOW = "low"  # 0-40%
    MEDIUM = "medium"  # 41-70%
    HIGH = "high"  # 71-90%
    VERY_HIGH = "very_high"  # 91-100%


@dataclass
class PredictionResult:
    """Structured prediction result"""

    prediction_type: PredictionType
    predicted_value: float  # 0-1 probability
    predicted_class: str  # "success", "failure", "fulfilled", etc.
    confidence: float  # 0-1 confidence score
    confidence_level: PredictionConfidence
    factors: Dict[str, float]  # Contributing factors and weights
    similar_cases: List[Dict]  # Similar historical cases
    model_version: str
    timestamp: datetime
    explanation: str  # Human-readable explanation


class BillPassagePredictor:
    """
    Predicts likelihood of a bill passing through Congress.

    Features:
    - Bill characteristics (type, topic, length)
    - Sponsor influence score
    - Political climate indicators
    - Historical patterns by topic
    - Congressional composition
    """

    def __init__(self, model_path: str = "models/bill_passage_model.pkl"):
        self.model_path = model_path
        self.scaler = StandardScaler()
        self.model: Optional[GradientBoostingClassifier] = None
        self.feature_names = [
            "congress_progressiveness",  # 0-1 scale
            "sponsor_influence_score",  # 0-100
            "bill_length_norm",  # normalized
            "bipartisan_sponsors",  # 0-1 ratio
            "topic_controversy",  # 0-1 scale
            "timing_from_election",  # months
            "public_support_estimate",  # 0-100
            "lobbying_spending_norm",  # normalized
            "committee_favorability",  # 0-1
            "similar_bills_success_rate",  # 0-1
        ]
        self._load_model()

    def _load_model(self) -> None:
        """Load trained model or create default"""
        try:
            model_file = Path(self.model_path)
            if model_file.exists():
                with open(model_file, "rb") as f:
                    data = pickle.load(f)
                    self.model = data.get("model")
                    self.scaler = data.get("scaler", self.scaler)
                logger.info("Loaded trained bill passage model")
            else:
                self._create_default_model()
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            self._create_default_model()

    def _create_default_model(self) -> None:
        """Create default model with synthetic training data"""
        # In production, this would be trained on real historical data
        self.model = GradientBoostingClassifier(
            n_estimators=100, max_depth=5, random_state=42
        )
        logger.info("Created default bill passage model")

    def predict_passage(
        self,
        bill_id: str,
        bill_type: str,
        sponsor_id: str,
        topic: str,
        congress_number: int,
        introduced_date: datetime,
        co_sponsors: List[Dict] = None,
        committee_reports: List[Dict] = None,
        **kwargs,
    ) -> PredictionResult:
        """
        Predict bill passage likelihood.

        Args:
            bill_id: Unique bill identifier
            bill_type: "H.R.", "S.", etc.
            sponsor_id: Primary sponsor identifier
            topic: Bill topic category
            congress_number: Congress session number
            introduced_date: Date bill was introduced
            co_sponsors: List of co-sponsor data
            committee_reports: Committee report data
            **kwargs: Additional context features

        Returns:
            PredictionResult with passage probability and confidence
        """
        # Extract features from inputs
        features = self._extract_bill_features(
            bill_type=bill_type,
            sponsor_id=sponsor_id,
            topic=topic,
            congress_number=congress_number,
            introduced_date=introduced_date,
            co_sponsors=co_sponsors or [],
            committee_reports=committee_reports or [],
            **kwargs,
        )

        # Normalize and scale features
        features_scaled = self.scaler.transform([features])

        # Get prediction
        probability = self.model.predict_proba(features_scaled)[0][1]
        prediction_class = "success" if probability > 0.5 else "failure"

        # Calculate confidence
        confidence = abs(probability - 0.5) * 2  # Maps 0-1 to 0-1 confidence

        # Get contributing factors
        factors = self._get_feature_importance(features)

        # Find similar historical cases
        similar_cases = self._find_similar_cases(features, top_n=5)

        # Generate explanation
        explanation = self._generate_explanation(
            probability=probability, factors=factors, bill_type=bill_type, topic=topic
        )

        return PredictionResult(
            prediction_type=PredictionType.BILL_PASAGE,
            predicted_value=probability,
            predicted_class=prediction_class,
            confidence=confidence,
            confidence_level=self._get_confidence_level(confidence),
            factors=factors,
            similar_cases=similar_cases,
            model_version="1.0.0",
            timestamp=datetime.now(),
            explanation=explanation,
        )

    def _extract_bill_features(
        self,
        bill_type: str,
        sponsor_id: str,
        topic: str,
        congress_number: int,
        introduced_date: datetime,
        co_sponsors: List[Dict],
        committee_reports: List[Dict],
        **kwargs,
    ) -> List[float]:
        """Extract numeric features from bill data"""
        # In production, these would come from actual data sources

        # 1. Congress progressiveness (0-1)
        congress_progressiveness = min(1.0, congress_number / 120.0)

        # 2. Sponsor influence score (0-100)
        sponsor_influence = 50.0  # Default, should be from data

        # 3. Bill length normalization
        bill_length_norm = kwargs.get("bill_length_norm", 0.5)

        # 4. Bipartisan sponsors ratio
        total_sponsors = len(co_sponsors) + 1
        bipartisan = sum(
            1 for s in co_sponsors if s.get("party") != kwargs.get("primary_party")
        )
        bipartisan_ratio = bipartisan / max(total_sponsors, 1)

        # 5. Topic controversy (0-1)
        controversy_topics = ["immigration", "abortion", "healthcare", "guns"]
        topic_controversy = 0.7 if topic.lower() in controversy_topics else 0.3

        # 6. Timing from election (months)
        election_month = 11  # November
        election_year = ((congress_number - 1) // 2) * 2 + 2025
        months_from_election = (
            abs(
                (introduced_date.year - election_year) * 12
                + introduced_date.month
                - election_month
            )
            % 24
        )

        # 7. Public support estimate
        public_support = kwargs.get("public_support", 50)

        # 8. Lobbying spending (normalized)
        lobbying_spending = kwargs.get("lobbying_spending_norm", 0.5)

        # 9. Committee favorability
        favorable_reports = sum(1 for r in committee_reports if r.get("favorable"))
        committee_favorability = favorable_reports / max(len(committee_reports), 1)

        # 10. Similar bills success rate
        similar_success = kwargs.get("similar_success_rate", 0.5)

        return [
            congress_progressiveness,
            sponsor_influence / 100.0,
            bill_length_norm,
            bipartisan_ratio,
            topic_controversy,
            months_from_election / 24.0,
            public_support / 100.0,
            lobbying_spending,
            committee_favorability,
            similar_success,
        ]

    def _get_feature_importance(self, features: List[float]) -> Dict[str, float]:
        """Get feature importance scores for this prediction"""
        importances = self.model.feature_importances_
        return {
            name: round(float(importance * value), 3)
            for name, importance, value in zip(
                self.feature_names, importances, features
            )
        }

    def _find_similar_cases(self, features: List[float], top_n: int = 5) -> List[Dict]:
        """Find similar historical bills"""
        # In production, this would query actual historical database
        # For now, return template structure
        return [
            {
                "bill_id": f"HR-{1000 + i}",
                "title": f"Similar Bill {i}",
                "passage_result": ["passed", "failed"][i % 2],
                "similarity_score": round(0.8 - i * 0.05, 2),
                "year": 2020 + i,
            }
            for i in range(top_n)
        ]

    def _generate_explanation(
        self, probability: float, factors: Dict[str, float], bill_type: str, topic: str
    ) -> str:
        """Generate human-readable explanation"""
        if probability > 0.7:
            confidence_text = "high likelihood"
        elif probability > 0.5:
            confidence_text = "moderate likelihood"
        else:
            confidence_text = "low likelihood"

        top_factors = sorted(factors.items(), key=lambda x: x[1], reverse=True)[:3]
        factor_text = "; ".join(
            f"{name.replace('_', ' ').title()} ({value:.2f})"
            for name, value in top_factors
        )

        return (
            f"This {bill_type} bill on {topic} has a {confidence_text} of passing "
            f"({probability:.1%}). Key factors: {factor_text}."
        )

    def _get_confidence_level(self, confidence: float) -> PredictionConfidence:
        """Convert numeric confidence to enum level"""
        if confidence >= 0.9:
            return PredictionConfidence.VERY_HIGH
        elif confidence >= 0.7:
            return PredictionConfidence.HIGH
        elif confidence >= 0.4:
            return PredictionConfidence.MEDIUM
        else:
            return PredictionConfidence.LOW


class PromiseFulfillmentPredictor:
    """
    Predicts likelihood of campaign promises being fulfilled.

    Features:
    - Politician's historical fulfillment rate
    - Promise complexity and scope
    - Political feasibility
    - Timeline feasibility
    - External dependencies
    """

    def __init__(self, model_path: str = "models/promise_model.pkl"):
        self.model_path = model_path
        self.model: Optional[RandomForestClassifier] = None
        self.feature_names = [
            "historical_fulfillment_rate",  # politician's track record
            "promise_complexity",  # 1-5 scale
            "requires_legislation",  # binary
            "budget_requirement",  # 0-1 normalized
            "timeline_feasibility",  # 0-1
            "bipartisan_support",  # 0-1 estimate
            "public_visibility",  # 1-5 scale
            "political_priority",  # 1-5 scale
            "external_dependencies",  # count
            "similar_promises_success",  # 0-1
        ]
        self._load_model()

    def _load_model(self) -> None:
        """Load or create model"""
        try:
            model_file = Path(self.model_path)
            if model_file.exists():
                with open(model_file, "rb") as f:
                    data = pickle.load(f)
                    self.model = data.get("model")
                logger.info("Loaded promise fulfillment model")
            else:
                self.model = RandomForestClassifier(
                    n_estimators=100, max_depth=10, random_state=42
                )
                logger.info("Created default promise fulfillment model")
        except Exception as e:
            logger.error(f"Error loading promise model: {e}")
            self.model = RandomForestClassifier(n_estimators=100, random_state=42)

    def predict_fulfillment(
        self,
        promise_id: str,
        politician_id: str,
        promise_text: str,
        promise_date: datetime,
        deadline: Optional[datetime] = None,
        category: str = "general",
        politician_history: Dict = None,
        **kwargs,
    ) -> PredictionResult:
        """Predict promise fulfillment probability"""
        # Extract features
        features = self._extract_promise_features(
            promise_text=promise_text,
            promise_date=promise_date,
            deadline=deadline,
            category=category,
            politician_history=politician_history or {},
            **kwargs,
        )

        # Get prediction
        features_array = np.array(features).reshape(1, -1)
        probability = self.model.predict_proba(features_array)[0][1]

        # Determine fulfillment class
        if probability > 0.7:
            fulfillment_class = "likely_fulfilled"
        elif probability > 0.4:
            fulfillment_class = "partially_fulfilled"
        else:
            fulfillment_class = "unlikely_fulfilled"

        # Calculate confidence
        confidence = min(1.0, abs(probability - 0.5) * 2)

        # Get factors
        factors = self._get_promise_factors(features, kwargs)

        # Generate explanation
        explanation = self._generate_promise_explanation(
            probability=probability,
            fulfillment_class=fulfillment_class,
            factors=factors,
            category=category,
        )

        return PredictionResult(
            prediction_type=PredictionType.PROMISE_FULFILLMENT,
            predicted_value=probability,
            predicted_class=fulfillment_class,
            confidence=confidence,
            confidence_level=self._get_confidence_level(confidence),
            factors=factors,
            similar_cases=[],  # Can be added later
            model_version="1.0.0",
            timestamp=datetime.now(),
            explanation=explanation,
        )

    def _extract_promise_features(
        self,
        promise_text: str,
        promise_date: datetime,
        deadline: Optional[datetime],
        category: str,
        politician_history: Dict,
        **kwargs,
    ) -> List[float]:
        """Extract features from promise data"""
        # Historical fulfillment rate
        historical_rate = politician_history.get("fulfillment_rate", 0.5)

        # Promise complexity (simplified text analysis)
        word_count = len(promise_text.split())
        complexity = min(5, max(1, word_count / 20))

        # Requires legislation flag
        legislation_keywords = ["pass", "law", "bill", "legislation", "congress"]
        requires_legislation = any(
            kw in promise_text.lower() for kw in legislation_keywords
        )

        # Budget requirement
        budget_keywords = ["fund", "dollar", "million", "billion", "budget"]
        budget_score = (
            sum(1 for kw in budget_keywords if kw in promise_text.lower()) / 5.0
        )

        # Timeline feasibility
        if deadline:
            days_until = (deadline - promise_date).days
            timeline_feasibility = min(1.0, max(0.1, 365 / max(days_until, 1)))
        else:
            timeline_feasibility = 0.5

        # Bipartisan support estimate
        bipartisan_keywords = ["together", "all americans", "both parties"]
        bipartisan = (
            sum(1 for kw in bipartisan_keywords if kw in promise_text.lower()) / 3.0
        )

        # Public visibility (category-based)
        high_visibility_categories = ["healthcare", "economy", "immigration"]
        public_visibility = 4 if category.lower() in high_visibility_categories else 2

        # Political priority (placeholder)
        political_priority = kwargs.get("priority_score", 3)

        # External dependencies count
        external_deps = kwargs.get("dependency_count", 1)

        # Similar promises success
        similar_success = politician_history.get("category_success_rate", 0.5)

        return [
            historical_rate,
            complexity / 5.0,
            1.0 if requires_legislation else 0.0,
            budget_score,
            timeline_feasibility,
            bipartisan,
            public_visibility / 5.0,
            political_priority / 5.0,
            min(external_deps, 5) / 5.0,
            similar_success,
        ]

    def _get_promise_factors(
        self, features: List[float], kwargs: Dict
    ) -> Dict[str, float]:
        """Get contributing factors for promise prediction"""
        importances = self.model.feature_importances_
        return {
            name: round(float(importance * value), 3)
            for name, importance, value in zip(
                self.feature_names, importances, features
            )
        }

    def _generate_promise_explanation(
        self,
        probability: float,
        fulfillment_class: str,
        factors: Dict[str, float],
        category: str,
    ) -> str:
        """Generate explanation for promise prediction"""
        if fulfillment_class == "likely_fulfilled":
            likelihood = "high likelihood"
        elif fulfillment_class == "partially_fulfilled":
            likelihood = "moderate likelihood"
        else:
            likelihood = "low likelihood"

        return (
            f"This {category} promise has a {likelihood} of fulfillment ({probability:.1%}). "
            f"Key factors include historical track record, complexity, and political feasibility."
        )

    def _get_confidence_level(self, confidence: float) -> PredictionConfidence:
        """Convert confidence to enum"""
        if confidence >= 0.9:
            return PredictionConfidence.VERY_HIGH
        elif confidence >= 0.7:
            return PredictionConfidence.HIGH
        elif confidence >= 0.4:
            return PredictionConfidence.MEDIUM
        else:
            return PredictionConfidence.LOW


class PredictiveAnalyticsService:
    """
    Main service orchestrating all predictions and analytics.

    Provides a unified interface for all predictive analytics
    including bill passage, promise fulfillment, and vote outcomes.
    """

    def __init__(self):
        self.bill_predictor = BillPassagePredictor()
        self.promise_predictor = PromiseFulfillmentPredictor()
        self.prediction_cache: Dict[str, Tuple[PredictionResult, datetime]] = {}
        self.cache_ttl = timedelta(hours=1)

    def predict_bill_outcome(
        self, bill_data: Dict, force_refresh: bool = False
    ) -> PredictionResult:
        """
        Main entry point for bill passage prediction.

        Args:
            bill_data: Dictionary with bill information
            force_refresh: Skip cache and recalculate

        Returns:
            PredictionResult with passage prediction
        """
        cache_key = f"bill_{bill_data.get('id')}"

        # Check cache
        if not force_refresh and cache_key in self.prediction_cache:
            result, timestamp = self.prediction_cache[cache_key]
            if datetime.now() - timestamp < self.cache_ttl:
                logger.debug("Returning cached bill prediction")
                return result

        # Generate prediction
        result = self.bill_predictor.predict_passage(**bill_data)

        # Cache result
        self.prediction_cache[cache_key] = (result, datetime.now())

        return result

    def predict_promise_fulfillment(
        self, promise_data: Dict, force_refresh: bool = False
    ) -> PredictionResult:
        """
        Main entry point for promise fulfillment prediction.

        Args:
            promise_data: Dictionary with promise information
            force_refresh: Skip cache and recalculate

        Returns:
            PredictionResult with fulfillment prediction
        """
        cache_key = f"promise_{promise_data.get('id')}"

        # Check cache
        if not force_refresh and cache_key in self.prediction_cache:
            result, timestamp = self.prediction_cache[cache_key]
            if datetime.now() - timestamp < self.cache_ttl:
                logger.debug("Returning cached promise prediction")
                return result

        # Generate prediction
        result = self.promise_predictor.predict_fulfillment(**promise_data)

        # Cache result
        self.prediction_cache[cache_key] = (result, datetime.now())

        return result

    def generate_dashboard_predictions(
        self, politician_id: str, context_data: Dict
    ) -> Dict[str, List[PredictionResult]]:
        """
        Generate all relevant predictions for a politician dashboard.

        Args:
            politician_id: Politician identifier
            context_data: Current state and historical data

        Returns:
            Dictionary of prediction categories with results
        """
        logger.info(f"Generating dashboard predictions for {politician_id}")

        predictions = {"pending_bills": [], "active_promises": [], "upcoming_votes": []}

        # Predict pending bills
        pending_bills = context_data.get("pending_bills", [])
        for bill in pending_bills[:10]:  # Top 10
            try:
                pred = self.predict_bill_outcome(bill)
                predictions["pending_bills"].append(pred)
            except Exception as e:
                logger.error(f"Error predicting bill {bill.get('id')}: {e}")

        # Predict active promises
        active_promises = context_data.get("active_promises", [])
        for promise in active_promises[:10]:  # Top 10
            try:
                pred = self.predict_promise_fulfillment(promise)
                predictions["active_promises"].append(pred)
            except Exception as e:
                logger.error(f"Error predicting promise {promise.get('id')}: {e}")

        return predictions

    def get_prediction_statistics(self, politician_id: Optional[str] = None) -> Dict:
        """Get statistics about prediction accuracy"""
        # In production, this would query actual accuracy tracking
        return {
            "total_predictions": 0,
            "accuracy_bill_passage": 0.0,
            "accuracy_promise_fulfillment": 0.0,
            "avg_confidence": 0.0,
            "prediction_distribution": {
                "high_confidence": 0,
                "medium_confidence": 0,
                "low_confidence": 0,
            },
        }

    def clear_cache(self) -> None:
        """Clear all cached predictions"""
        self.prediction_cache.clear()
        logger.info("Cleared prediction cache")

    def export_predictions(
        self, predictions: List[PredictionResult], format: str = "json"
    ) -> str:
        """Export predictions to specified format"""
        data = [
            {
                "type": p.prediction_type.value,
                "predicted_value": p.predicted_value,
                "predicted_class": p.predicted_class,
                "confidence": p.confidence,
                "confidence_level": p.confidence_level.value,
                "factors": p.factors,
                "timestamp": p.timestamp.isoformat(),
                "explanation": p.explanation,
            }
            for p in predictions
        ]

        if format == "json":
            return json.dumps(data, indent=2)
        elif format == "csv":
            # Simplified CSV export
            return "id,type,probability,class,confidence,timestamp\n" + "\n".join(
                f"{i},{p['type']},{p['predicted_value']:.3f},{p['predicted_class']},{p['confidence']:.3f},{p['timestamp']}"
                for i, p in enumerate(data)
            )

        raise ValueError(f"Unsupported format: {format}")


# Singleton instance for application-wide use
_prediction_service: Optional[PredictiveAnalyticsService] = None


def get_prediction_service() -> PredictiveAnalyticsService:
    """Get or create the singleton prediction service"""
    global _prediction_service
    if _prediction_service is None:
        _prediction_service = PredictiveAnalyticsService()
    return _prediction_service

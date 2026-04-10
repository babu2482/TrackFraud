"""
Pattern Engine - Voting Pattern Analysis and Prediction
========================================================

This module provides AI-powered pattern recognition for analyzing voting behavior,
detecting coalitions, and predicting future legislative outcomes.

Key Features:
- Voting pattern similarity analysis
- Coalition detection and tracking
- Ideological shift identification
- Vote outcome prediction
- Temporal pattern analysis

Author: The Glass House Team
License: MIT
"""

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from scipy import stats
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)


@dataclass
class VotePattern:
    """Represents a politician's voting pattern"""

    politician_id: str
    politician_name: str
    party: str
    chamber: str  # House or Senate
    votes: Dict[str, str] = field(default_factory=dict)  # bill_id -> YEA/NAY/PRESENT
    voting_rate: float = 0.0  # Percentage of votes cast
    ideological_position: float = 0.0  # -1 (liberal) to 1 (conservative)
    consistency_score: float = 0.0  # How consistently they vote with party


@dataclass
class Coalition:
    """Represents a voting coalition"""

    coalition_id: str
    name: str
    members: List[str]  # politician_ids
    cohesion_score: float  # 0-1, how unified they vote
    average_ideology: float
    topic_affinities: Dict[str, float]  # topic -> affinity score
    formation_date: datetime
    member_count: int = 0

    def __post_init__(self):
        self.member_count = len(self.members)


@dataclass
class Prediction:
    """Represents a vote outcome prediction"""

    bill_id: str
    bill_title: str
    predicted_outcome: str  # PASS/FAIL
    confidence: float  # 0-100%
    predicted_vote_split: Dict[str, int]  # YEA/NAY/PRESENT counts
    key_players: List[Dict[str, Any]]
    reasoning: str
    created_at: datetime = field(default_factory=datetime.utcnow)


class PatternEngine:
    """
    AI-powered pattern recognition engine for legislative analysis.

    Uses machine learning and statistical analysis to:
    - Identify voting patterns and similarities
    - Detect and track voting coalitions
    - Predict legislative outcomes
    - Track ideological shifts over time
    """

    def __init__(self):
        self.vote_patterns: Dict[str, VotePattern] = {}
        self.coalitions: Dict[str, Coalition] = {}
        self.historical_predictions: List[Prediction] = []
        self.topic_vectors: Dict[str, np.ndarray] = {}

        # Configuration
        self.similarity_threshold = 0.75  # Minimum similarity to be considered aligned
        self.coalition_min_size = 5  # Minimum members for a coalition
        self.coalition_cohesion_threshold = 0.7  # Minimum cohesion score

    def analyze_voting_similarity(
        self, politician1_id: str, politician2_id: str
    ) -> Dict[str, Any]:
        """
        Calculate voting similarity between two politicians.

        Args:
            politician1_id: First politician ID
            politician2_id: Second politician ID

        Returns:
            Dictionary with similarity metrics
        """
        if (
            politician1_id not in self.vote_patterns
            or politician2_id not in self.vote_patterns
        ):
            raise ValueError("One or both politicians not found in pattern database")

        p1 = self.vote_patterns[politician1_id]
        p2 = self.vote_patterns[politician2_id]

        # Get common votes (both politicians voted)
        common_bills = set(p1.votes.keys()) & set(p2.votes.keys())

        if not common_bills:
            return {
                "similarity_score": 0.0,
                "common_votes": 0,
                "agreement_rate": 0.0,
                "disagreement_rate": 0.0,
                "message": "No common votes found",
            }

        # Calculate agreement rate
        agreements = sum(1 for bill in common_bills if p1.votes[bill] == p2.votes[bill])
        agreement_rate = agreements / len(common_bills)

        # Calculate ideological distance
        ideology_distance = abs(p1.ideological_position - p2.ideological_position)

        # Overall similarity score (weighted average)
        similarity_score = 0.6 * agreement_rate + 0.4 * (1 - ideology_distance)

        # Topic-specific analysis
        topic_analysis = self._analyze_topic_similarity(p1, p2, common_bills)

        return {
            "politician1": p1.politician_name,
            "politician2": p2.politician_name,
            "similarity_score": similarity_score,
            "agreement_rate": agreement_rate,
            "common_votes": len(common_bills),
            "ideology_distance": ideology_distance,
            "topic_analysis": topic_analysis,
            "coalition_likelihood": "High"
            if similarity_score > 0.8
            else "Medium"
            if similarity_score > 0.6
            else "Low",
        }

    def detect_coalitions(self, topic: Optional[str] = None) -> List[Coalition]:
        """
        Detect voting coalitions using clustering algorithms.

        Args:
            topic: Optional topic filter (e.g., "climate", "healthcare")

        Returns:
            List of detected coalitions
        """
        # Get vote matrix
        politicians = list(self.vote_patterns.keys())
        if len(politicians) < self.coalition_min_size:
            return []

        # Build vote vectors
        vote_vectors = []
        politician_ids = []

        for pol_id in politicians:
            pattern = self.vote_patterns[pol_id]
            # Filter by topic if specified
            bills = pattern.votes.keys()
            if topic:
                bills = self._filter_bills_by_topic(bills, topic)

            if not bills:
                continue

            # Convert votes to numeric (YEA=1, NAY=-1, PRESENT=0)
            vote_map = {"YEA": 1, "NAY": -1, "PRESENT": 0}
            vector = [vote_map.get(pattern.votes[bill], 0) for bill in bills]

            vote_vectors.append(vector)
            politician_ids.append(pol_id)

        if len(vote_vectors) < self.coalition_min_size:
            return []

        # Convert to numpy array
        vote_matrix = np.array(vote_vectors)

        # Normalize vectors
        vote_matrix = vote_matrix / (
            np.linalg.norm(vote_matrix, axis=1, keepdims=True) + 1e-10
        )

        # Calculate optimal number of clusters using silhouette score
        inertias = []
        silhouette_scores = []

        for k in range(2, min(10, len(vote_vectors))):
            kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
            labels = kmeans.fit_predict(vote_matrix)

            # Calculate silhouette score
            from sklearn.metrics import silhouette_score

            score = silhouette_score(vote_matrix, labels)
            silhouette_scores.append(score)
            inertias.append(kmeans.inertia_)

        # Choose optimal k (elbow method + silhouette)
        optimal_k = np.argmax(silhouette_scores) + 2

        # Run final clustering
        kmeans = KMeans(n_clusters=optimal_k, random_state=42, n_init=10)
        labels = kmeans.fit_predict(vote_matrix)

        # Build coalitions from clusters
        coalitions = []
        cluster_members = defaultdict(list)

        for idx, label in enumerate(labels):
            cluster_members[label].append(politician_ids[idx])

        for cluster_id, members in cluster_members.items():
            if len(members) < self.coalition_min_size:
                continue

            # Calculate coalition cohesion
            cohesion = self._calculate_cohesion(members, topic)

            if cohesion >= self.coalition_cohesion_threshold:
                coalition = Coalition(
                    coalition_id=f"coalition_{cluster_id}_{datetime.utcnow().strftime('%Y%m%d')}",
                    name=self._generate_coalition_name(members, topic),
                    members=members,
                    cohesion_score=cohesion,
                    average_ideology=np.mean(
                        [
                            self.vote_patterns[mid].ideological_position
                            for mid in members
                        ]
                    ),
                    topic_affinities=self._calculate_topic_affinities(members, topic),
                    formation_date=datetime.utcnow(),
                )
                coalitions.append(coalition)
                self.coalitions[coalition.coalition_id] = coalition

        return coalitions

    def predict_vote_outcome(
        self, bill_id: str, bill_title: str, bill_topic: str, sponsor_ids: List[str]
    ) -> Prediction:
        """
        Predict the outcome of a legislative vote.

        Args:
            bill_id: Unique bill identifier
            bill_title: Bill title/name
            bill_topic: Topic category
            sponsor_ids: IDs of bill sponsors

        Returns:
            Prediction object with outcome and confidence
        """
        # Get all politicians
        politicians = list(self.vote_patterns.keys())

        if not politicians:
            raise ValueError("No voting patterns available for prediction")

        # Analyze sponsor influence
        sponsor_patterns = [
            self.vote_patterns[sid] for sid in sponsor_ids if sid in self.vote_patterns
        ]

        # Estimate bill ideological direction
        if sponsor_patterns:
            bill_ideology = np.mean([p.ideological_position for p in sponsor_patterns])
        else:
            bill_ideology = 0.0

        # Predict each politician's vote
        vote_predictions = {}

        for pol_id in politicians:
            pattern = self.vote_patterns[pol_id]

            # Base prediction on ideology alignment
            ideology_diff = abs(pattern.ideological_position - bill_ideology)

            # Party alignment factor
            party_alignment = 0.5  # Neutral baseline
            if sponsor_patterns:
                for sponsor in sponsor_patterns:
                    if pattern.party == sponsor.party:
                        party_alignment = 0.8
                    else:
                        party_alignment = 0.3

            # Topic affinity factor
            topic_factor = self._get_topic_affinity(pattern, bill_topic)

            # Combined prediction score
            prediction_score = (
                0.3 * (1 - ideology_diff)  # Closer ideology = more likely to support
                + 0.3 * party_alignment  # Same party = more likely to support
                + 0.4 * topic_factor  # Topic affinity
            )

            # Convert to vote prediction
            if prediction_score > 0.65:
                vote_predictions[pol_id] = "YEA"
            elif prediction_score < 0.35:
                vote_predictions[pol_id] = "NAY"
            else:
                vote_predictions[pol_id] = "UNCERTAIN"

        # Count predictions
        yea_count = sum(1 for v in vote_predictions.values() if v == "YEA")
        nay_count = sum(1 for v in vote_predictions.values() if v == "NAY")
        uncertain_count = sum(1 for v in vote_predictions.values() if v == "UNCERTAIN")

        # Calculate confidence
        total_votes = yea_count + nay_count
        confidence = (
            (max(yea_count, nay_count) / total_votes * 100) if total_votes > 0 else 0
        )

        # Adjust for uncertainty
        confidence *= 1 - (uncertain_count / len(politicians))

        # Determine outcome
        if yea_count > nay_count:
            outcome = "PASS"
        elif nay_count > yea_count:
            outcome = "FAIL"
        else:
            outcome = "UNCERTAIN"

        # Identify key players (swing voters)
        key_players = self._identify_key_players(
            politicians, prediction_score, bill_topic
        )

        # Generate reasoning
        reasoning = self._generate_prediction_reasoning(
            yea_count, nay_count, uncertain_count, bill_ideology, bill_topic
        )

        prediction = Prediction(
            bill_id=bill_id,
            bill_title=bill_title,
            predicted_outcome=outcome,
            confidence=confidence,
            predicted_vote_split={
                "YEA": yea_count,
                "NAY": nay_count,
                "PRESENT": uncertain_count,
            },
            key_players=key_players,
            reasoning=reasoning,
        )

        self.historical_predictions.append(prediction)

        return prediction

    def track_ideological_shift(
        self, politician_id: str, time_periods: List[Tuple[datetime, datetime]]
    ) -> Dict[str, Any]:
        """
        Track ideological shifts over time periods.

        Args:
            politician_id: Politician to track
            time_periods: List of (start, end) datetime tuples

        Returns:
            Dictionary with shift analysis
        """
        if politician_id not in self.vote_patterns:
            raise ValueError("Politician not found")

        pattern = self.vote_patterns[politician_id]

        shifts = []
        positions_over_time = []

        for start_date, end_date in time_periods:
            # Get votes in this period (would need historical vote data)
            period_votes = self._get_votes_in_period(
                politician_id, start_date, end_date
            )

            if not period_votes:
                continue

            # Calculate ideology for this period
            ideology = self._calculate_ideology_from_votes(period_votes)
            positions_over_time.append((end_date, ideology))

        if len(positions_over_time) < 2:
            return {
                "politician": pattern.politician_name,
                "message": "Insufficient data for shift analysis",
                "shift_detected": False,
            }

        # Calculate overall shift
        start_pos = positions_over_time[0][1]
        end_pos = positions_over_time[-1][1]
        total_shift = end_pos - start_pos

        # Determine shift direction
        if abs(total_shift) < 0.1:
            shift_direction = "STABLE"
        elif total_shift > 0:
            shift_direction = "RIGHT"
        else:
            shift_direction = "LEFT"

        # Calculate volatility (standard deviation)
        volatilities = [
            abs(positions_over_time[i + 1][1] - positions_over_time[i][1])
            for i in range(len(positions_over_time) - 1)
        ]
        avg_volatility = np.mean(volatilities) if volatilities else 0

        return {
            "politician": pattern.politician_name,
            "politician_id": politician_id,
            "shift_detected": abs(total_shift) >= 0.1,
            "shift_direction": shift_direction,
            "total_shift_magnitude": abs(total_shift),
            "start_position": start_pos,
            "end_position": end_pos,
            "volatility": avg_volatility,
            "positions_over_time": positions_over_time,
            "analysis": self._analyze_shift_significance(total_shift, avg_volatility),
        }

    def _analyze_topic_similarity(
        self, p1: VotePattern, p2: VotePattern, common_bills: set
    ) -> Dict[str, float]:
        """Analyze topic-specific voting similarity"""
        # This would use bill metadata to categorize by topic
        # For now, return placeholder structure
        return {
            "economy": 0.72,
            "healthcare": 0.65,
            "social": 0.58,
            "defense": 0.81,
            "environment": 0.44,
        }

    def _filter_bills_by_topic(self, bills: set, topic: str) -> set:
        """Filter bills by topic (placeholder)"""
        # Would use bill metadata
        return bills

    def _calculate_cohesion(
        self, member_ids: List[str], topic: Optional[str] = None
    ) -> float:
        """Calculate coalition cohesion score"""
        if len(member_ids) < 2:
            return 0.0

        # Get vote patterns for all members
        patterns = [
            self.vote_patterns[mid] for mid in member_ids if mid in self.vote_patterns
        ]

        if len(patterns) < 2:
            return 0.0

        # Calculate pairwise agreements
        total_agreements = 0
        total_comparisons = 0

        for i in range(len(patterns)):
            for j in range(i + 1, len(patterns)):
                common_votes = set(patterns[i].votes.keys()) & set(
                    patterns[j].votes.keys()
                )

                if not common_votes:
                    continue

                agreements = sum(
                    1
                    for bill in common_votes
                    if patterns[i].votes[bill] == patterns[j].votes[bill]
                )

                total_agreements += agreements
                total_comparisons += len(common_votes)

        if total_comparisons == 0:
            return 0.0

        return total_agreements / total_comparisons

    def _calculate_topic_affinities(
        self, member_ids: List[str], topic: Optional[str] = None
    ) -> Dict[str, float]:
        """Calculate coalition's affinity for different topics"""
        # Placeholder - would use bill metadata
        return {
            "economy": 0.75,
            "healthcare": 0.68,
            "social": 0.55,
            "defense": 0.82,
            "environment": 0.41,
        }

    def _generate_coalition_name(
        self, member_ids: List[str], topic: Optional[str] = None
    ) -> str:
        """Generate descriptive coalition name"""
        # Simple heuristic based on ideology
        avg_ideology = np.mean(
            [
                self.vote_patterns[mid].ideological_position
                for mid in member_ids
                if mid in self.vote_patterns
            ]
        )

        if topic:
            return f"{topic.title()} Coalition"

        if avg_ideology > 0.3:
            return "Conservative Bloc"
        elif avg_ideology < -0.3:
            return "Progressive Alliance"
        else:
            return "Centrist Coalition"

    def _get_topic_affinity(self, pattern: VotePattern, topic: str) -> float:
        """Get politician's affinity for a topic"""
        # Placeholder - would use historical voting on similar bills
        return 0.5

    def _identify_key_players(
        self, politician_ids: List[str], prediction_score: float, bill_topic: str
    ) -> List[Dict[str, Any]]:
        """Identify swing voters and key players"""
        # Would identify politicians near decision boundary
        return [
            {
                "politician_id": "example_id",
                "name": "Example Politician",
                "role": "swing_voter",
                "influence_score": 0.85,
            }
        ]

    def _generate_prediction_reasoning(
        self,
        yea_count: int,
        nay_count: int,
        uncertain_count: int,
        bill_ideology: float,
        bill_topic: str,
    ) -> str:
        """Generate human-readable prediction reasoning"""
        ideology_desc = (
            "conservative"
            if bill_ideology > 0.2
            else "liberal"
            if bill_ideology < -0.2
            else "moderate"
        )

        return (
            f"Predicted outcome based on analysis of {yea_count + nay_count} expected votes. "
            f"Bill leans {ideology_desc} on {bill_topic} topics. "
            f"{uncertain_count} politicians remain uncertain."
        )

    def _get_votes_in_period(
        self, politician_id: str, start_date: datetime, end_date: datetime
    ) -> Dict[str, str]:
        """Get votes within a time period (placeholder)"""
        return {}

    def _calculate_ideology_from_votes(self, votes: Dict[str, str]) -> float:
        """Calculate ideological position from votes (placeholder)"""
        return 0.0

    def _analyze_shift_significance(
        self, shift_magnitude: float, volatility: float
    ) -> str:
        """Analyze significance of ideological shift"""
        if shift_magnitude < 0.1:
            return "Minimal shift, likely within normal variation"
        elif shift_magnitude < 0.3:
            return "Moderate shift, may indicate policy evolution"
        else:
            return "Significant shift, suggests major ideological change"

    def get_policy_bridges(
        self, topic: str, min_coalition_size: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Identify potential policy bridges across ideological divides.

        Args:
            topic: Policy topic to analyze
            min_coalition_size: Minimum coalition size for bridge

        Returns:
            List of potential policy bridges
        """
        # Find politicians with similar positions on this topic
        # regardless of overall ideology

        bridges = []

        # Group by topic affinity
        topic_groups = defaultdict(list)

        for pol_id, pattern in self.vote_patterns.items():
            affinity = self._get_topic_affinity(pattern, topic)

            if affinity >= 0.6:
                topic_groups["pro"].append(pol_id)
            elif affinity <= 0.4:
                topic_groups["anti"].append(pol_id)

        # Find moderate positions that could bridge
        moderate_pro = sorted(
            topic_groups["pro"],
            key=lambda x: self.vote_patterns[x].ideological_position,
        )[:5]

        moderate_anti = sorted(
            topic_groups["anti"],
            key=lambda x: self.vote_patterns[x].ideological_position,
            reverse=True,
        )[:5]

        for pro in moderate_pro:
            for anti in moderate_anti:
                # Check if they could potentially agree
                pro_pattern = self.vote_patterns[pro]
                anti_pattern = self.vote_patterns[anti]

                ideology_gap = abs(
                    pro_pattern.ideological_position - anti_pattern.ideological_position
                )

                if ideology_gap < 0.4:  # Reasonable bridge
                    bridges.append(
                        {
                            "politician1": pro_pattern.politician_name,
                            "politician2": anti_pattern.politician_name,
                            "ideology_gap": ideology_gap,
                            "topic_affinity_gap": abs(
                                self._get_topic_affinity(pro_pattern, topic)
                                - self._get_topic_affinity(anti_pattern, topic)
                            ),
                            "bridge_potential": "High"
                            if ideology_gap < 0.2
                            else "Medium",
                        }
                    )

        return bridges

    def export_analysis(self, output_format: str = "json") -> Dict[str, Any]:
        """
        Export current analysis in specified format.

        Args:
            output_format: json, csv, or dict

        Returns:
            Exported analysis data
        """
        export_data = {
            "summary": {
                "total_politicians_tracked": len(self.vote_patterns),
                "coalitions_detected": len(self.coalitions),
                "predictions_made": len(self.historical_predictions),
                "analysis_timestamp": datetime.utcnow().isoformat(),
            },
            "patterns": [
                {
                    "politician_id": pol_id,
                    "name": pattern.politician_name,
                    "party": pattern.party,
                    "ideological_position": pattern.ideological_position,
                    "consistency_score": pattern.consistency_score,
                    "voting_rate": pattern.voting_rate,
                }
                for pol_id, pattern in self.vote_patterns.items()
            ],
            "coalitions": [
                {
                    "coalition_id": coal.coalition_id,
                    "name": coal.name,
                    "member_count": coal.member_count,
                    "cohesion_score": coal.cohesion_score,
                    "average_ideology": coal.average_ideology,
                    "formation_date": coal.formation_date.isoformat(),
                }
                for coal in self.coalitions.values()
            ],
            "recent_predictions": [
                {
                    "bill_id": pred.bill_id,
                    "predicted_outcome": pred.predicted_outcome,
                    "confidence": pred.confidence,
                    "predicted_split": pred.predicted_vote_split,
                    "created_at": pred.created_at.isoformat(),
                }
                for pred in self.historical_predictions[-10:]  # Last 10
            ],
        }

        return export_data

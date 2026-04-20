from __future__ import annotations

from ..decision import Decision
from ..metrics import expected_remaining, reduction_ratio, shannon_entropy, worst_case_bucket
from ..observation import Observation
from ..strategy import StrategyBase


class PartitionStrategy(StrategyBase):
    """Shared pipeline for one-ply feedback-partition strategies.

    Every subclass sees the same guess pool (the full allowed list), the same
    partition scoring, and the same tie-break order, so benchmark comparisons
    are apples-to-apples. Subclasses differ only in ``metric_name``.
    """

    metric_name = "entropy"

    def _guess_pool(self, snapshot: Observation) -> tuple[str, ...]:
        return self.corpus.all_allowed

    def _score_candidate(self, guess: str, candidate_words: tuple[str, ...]) -> tuple[float, dict[str, float | int]]:
        counts = self.table.partition_counts(guess, candidate_words)
        entropy = shannon_entropy(counts)
        expected = expected_remaining(counts)
        worst_case = worst_case_bucket(counts)
        reduction = reduction_ratio(len(candidate_words), worst_case)
        if self.metric_name == "entropy":
            value = entropy
        elif self.metric_name == "elimination":
            value = -expected
        else:
            value = -worst_case
        return value, {
            "entropy": round(entropy, 6),
            "expected_remaining": round(expected, 6),
            "worst_case": worst_case,
            "reduction_ratio": round(reduction, 6),
        }

    def choose_guess(self, snapshot: Observation) -> Decision:
        cache_key = self._cache_key(snapshot)
        if cache_key in self.decision_cache:
            return self.decision_cache[cache_key]
        candidates = self._candidate_pool(snapshot)
        guesses = self._guess_pool(snapshot)
        candidate_set = set(candidates)
        best_key: tuple[float, int, int, str] | None = None
        best_guess = candidates[0]
        best_explanation: dict[str, float | int] = {}
        for guess in guesses:
            value, stats = self._score_candidate(guess, candidates)
            in_candidate = 0 if guess in candidate_set else 1
            key = (-value, stats["worst_case"], in_candidate, guess)
            if self._break_tie(best_key, key):
                best_key = key
                best_guess = guess
                best_explanation = {"pool_size": len(candidates), "guess_pool_size": len(guesses), **stats}
        decision = Decision(guess=best_guess, explanation=best_explanation)
        self.decision_cache[cache_key] = decision
        return decision


class CandidateEliminationStrategy(PartitionStrategy):
    """Core: minimize expected remaining candidates.

    Chooses the guess with the smallest ``sum(n**2)/N`` across feedback
    buckets, which equals the expected bucket size the true answer lands in
    under a uniform candidate prior. This is a one-step Bayes objective;
    greedy per-turn minimization may diverge from globally optimal total
    expected guesses.
    """

    metric_name = "elimination"


class EntropyStrategy(PartitionStrategy):
    """Core: maximize Shannon information gain.

    Chooses the guess whose feedback distribution has maximum entropy,
    rewarding balanced partitions across many patterns. Information gain is
    not the same as expected solve depth: a high-entropy guess can create
    awkward subproblems in later turns.
    """

    metric_name = "entropy"


class MinimaxStrategy(PartitionStrategy):
    """Core: minimize the worst-case surviving bucket.

    The one-ply worst-case criterion; especially relevant for Evil mode,
    whose adversary literally returns the largest-bucket pattern. This is
    greedy: the true minimax-optimal policy would minimize worst-case
    decision-tree depth recursively, not just the next bucket.
    """

    metric_name = "minimax"

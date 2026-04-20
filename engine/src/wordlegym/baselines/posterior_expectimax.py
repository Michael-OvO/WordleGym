from __future__ import annotations

from ..decision import Decision
from ..metrics import evil_forced_bucket_size, expected_remaining
from ..observation import Observation
from ..strategy import StrategyBase


class PosteriorExpectimaxStrategy(StrategyBase):
    """Aggregate-aware: one-step Bayesian expectimax for Unknown mode.

    ``score(g) = q * Sum(|B_r|^2/|C|) + (1 - q) * |T(C, g)|``

    * ``q = P(standard | history)`` -- mode posterior, supplied by the snapshot.
    * ``Sum(|B_r|^2/|C|)`` -- expected remaining candidates (the standard-mode
      one-step Bayes objective used by Candidate Elimination).
    * ``|T(C, g)|`` -- evil-forced bucket size (the one-step evil objective).

    Reduces cleanly to Candidate Elimination in pure Standard (``q = 1``) and
    to Evil Shortest Path in pure Evil (``q = 0``). In Unknown mode it uses the
    true posterior, so the two blended components are in the same "remaining
    candidates" units -- unlike ``posterior-hybrid``, where entropy and
    reduction ratio live on different scales.

    One-step approximation of the spec's Bayesian limited-depth expectimax:
    the true expectimax propagates value estimates recursively instead of
    truncating at depth 1.
    """

    def _guess_pool(self, snapshot: Observation) -> tuple[str, ...]:
        return self.corpus.all_allowed

    def _mode_weights(self, snapshot: Observation) -> tuple[float, float]:
        if snapshot.mode == "standard":
            return 1.0, 0.0
        if snapshot.mode == "evil":
            return 0.0, 1.0
        if snapshot.mode_posterior is not None:
            return snapshot.mode_posterior.standard, snapshot.mode_posterior.evil
        standard_candidates = snapshot.standard_candidates or snapshot.candidates
        denominator = len(self.corpus.answers) + len(standard_candidates)
        q = len(standard_candidates) / denominator if denominator > 0 else 0.5
        return q, 1.0 - q

    def choose_guess(self, snapshot: Observation) -> Decision:
        cache_key = self._cache_key(snapshot)
        if cache_key in self.decision_cache:
            return self.decision_cache[cache_key]
        candidates = self._candidate_pool(snapshot)
        guesses = self._guess_pool(snapshot)
        candidate_set = set(candidates)
        q_std, q_evil = self._mode_weights(snapshot)
        best_key: tuple[float, int, int, str] | None = None
        best_guess = candidates[0]
        best_explanation: dict[str, float | int | dict[str, float]] = {}
        for guess in guesses:
            counts = self.table.partition_counts(guess, candidates)
            expected_rem = expected_remaining(counts)
            forced_size = evil_forced_bucket_size(counts)
            score = q_std * expected_rem + q_evil * forced_size
            in_candidate = 0 if guess in candidate_set else 1
            key = (score, in_candidate, forced_size, guess)
            if self._break_tie(best_key, key):
                best_key = key
                best_guess = guess
                best_explanation = {
                    "pool_size": len(candidates),
                    "guess_pool_size": len(guesses),
                    "expected_remaining": round(expected_rem, 6),
                    "evil_forced_bucket": forced_size,
                    "blended_score": round(score, 6),
                    "mode_weights": {"standard": round(q_std, 6), "evil": round(q_evil, 6)},
                }
        decision = Decision(guess=best_guess, explanation=best_explanation)
        self.decision_cache[cache_key] = decision
        return decision

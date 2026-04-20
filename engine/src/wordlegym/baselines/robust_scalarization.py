from __future__ import annotations

from ..decision import Decision
from ..metrics import evil_forced_bucket_size, expected_remaining
from ..observation import Observation
from ..strategy import StrategyBase


class RobustScalarizationStrategy(StrategyBase):
    """Aggregate-aware: minimax-over-modes one-step scorer.

    ``score(g) = max( Sum(|B_r|^2/|C|),  |T(C, g)| )``

    For each guess, compute two one-step cost estimates: the standard-mode
    expected remaining candidates and the evil-forced bucket size. Pick the
    guess minimizing the larger of the two, so the chosen guess has bounded
    one-step cost under either mode.

    This is the practical scalarization from the spec's cross-mode robustness
    section (the ``max_m J_m(g)`` form). A true robust-optimum policy would
    search the Pareto frontier of ``(J_standard, J_evil)`` recursively over
    reachable histories. Ties broken by mean cost, then lexicographic order.
    """

    def _guess_pool(self, snapshot: Observation) -> tuple[str, ...]:
        return self.corpus.all_allowed

    def choose_guess(self, snapshot: Observation) -> Decision:
        cache_key = self._cache_key(snapshot)
        if cache_key in self.decision_cache:
            return self.decision_cache[cache_key]
        candidates = self._candidate_pool(snapshot)
        guesses = self._guess_pool(snapshot)
        candidate_set = set(candidates)
        best_key: tuple[float, float, int, str] | None = None
        best_guess = candidates[0]
        best_explanation: dict[str, float | int] = {}
        for guess in guesses:
            counts = self.table.partition_counts(guess, candidates)
            expected_rem = expected_remaining(counts)
            forced_size = float(evil_forced_bucket_size(counts))
            robust_score = max(expected_rem, forced_size)
            mean_score = 0.5 * (expected_rem + forced_size)
            in_candidate = 0 if guess in candidate_set else 1
            key = (robust_score, mean_score, in_candidate, guess)
            if self._break_tie(best_key, key):
                best_key = key
                best_guess = guess
                best_explanation = {
                    "pool_size": len(candidates),
                    "guess_pool_size": len(guesses),
                    "standard_cost": round(expected_rem, 6),
                    "evil_cost": int(forced_size),
                    "robust_score": round(robust_score, 6),
                    "mean_cost": round(mean_score, 6),
                }
        decision = Decision(guess=best_guess, explanation=best_explanation)
        self.decision_cache[cache_key] = decision
        return decision

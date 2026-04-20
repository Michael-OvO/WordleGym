from __future__ import annotations

import math

from ..decision import Decision
from ..metrics import reduction_ratio, shannon_entropy, worst_case_bucket
from ..observation import Observation
from ..strategy import StrategyBase


class PosteriorHybridStrategy(StrategyBase):
    """Experimental: posterior-weighted hybrid for Unknown mode.

    Blends normalized standard-mode entropy with evil-mode worst-case
    reduction using the mode posterior as weights. The two components are
    not measured in the same units (information vs. elimination fraction),
    and the posterior-weighted blend is not the Bayes-optimal Unknown-mode
    policy -- a true optimum would reason recursively over both branches.
    Useful as a mode-aware benchmark, not as a claimed optimal solver.
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
        standard_candidates = snapshot.standard_candidates or candidates
        evil_candidates = snapshot.evil_candidates or candidates
        if snapshot.mode_posterior is None:
            standard_weight = 1.0 if snapshot.mode == "standard" else 0.0
            evil_weight = 1.0 if snapshot.mode == "evil" else 0.5
        else:
            standard_weight = snapshot.mode_posterior.standard
            evil_weight = snapshot.mode_posterior.evil

        # Guard singleton / empty pools: log2(<=1) collapses to 0 or is undefined,
        # which would make normalized entropy a division-by-zero. Fall back to 1.0
        # so normalized_entropy becomes 0 (the correct limit when no information
        # can be gained) rather than NaN/Inf.
        standard_pool_size = len(standard_candidates)
        max_entropy = math.log2(standard_pool_size) if standard_pool_size > 1 else 1.0
        best_key: tuple[float, int, int, str] | None = None
        best_guess = candidates[0]
        best_explanation: dict[str, float | int] = {}

        for guess in guesses:
            standard_counts = self.table.partition_counts(guess, standard_candidates)
            evil_counts = self.table.partition_counts(guess, evil_candidates)
            standard_entropy = shannon_entropy(standard_counts)
            normalized_entropy = standard_entropy / max_entropy
            evil_worst_case = worst_case_bucket(evil_counts)
            evil_reduction = reduction_ratio(len(evil_candidates), evil_worst_case)
            blended = (standard_weight * normalized_entropy) + (evil_weight * evil_reduction)
            in_candidate = 0 if guess in candidate_set else 1
            key = (-blended, evil_worst_case, in_candidate, guess)
            if self._break_tie(best_key, key):
                best_key = key
                best_guess = guess
                best_explanation = {
                    "pool_size": len(candidates),
                    "guess_pool_size": len(guesses),
                    "standard_entropy": round(standard_entropy, 6),
                    "normalized_standard_entropy": round(normalized_entropy, 6),
                    "evil_reduction_ratio": round(evil_reduction, 6),
                    "evil_worst_case": evil_worst_case,
                    "mode_weights": {
                        "standard": round(standard_weight, 6),
                        "evil": round(evil_weight, 6),
                    },
                    "blended_score": round(blended, 6),
                }
        decision = Decision(guess=best_guess, explanation=best_explanation)
        self.decision_cache[cache_key] = decision
        return decision

from __future__ import annotations

from ..decision import Decision
from ..metrics import evil_forced_bucket_size, shannon_entropy
from ..observation import Observation
from ..strategy import StrategyBase


class EvilShortestPathStrategy(StrategyBase):
    """Aggregate-aware: greedy evil-forced-bucket minimizer.

    One-ply approximation of the exact shortest-path recurrence ``D(C)`` from
    the spec's Evil-mode section. Picks ``argmin_g |T(C, g)|`` -- the size of
    the evil-forced successor under the benchmark's tie-break rules -- with
    tie-breakers by partition entropy and lexicographic order.

    Exact ``D(C)`` requires recursive branch-and-bound with memoization over
    the deterministic evil subset graph; that is prohibitive at Wordle scale,
    so this strategy implements steps 1-3 of the spec's "greedy/A* ordering"
    recipe and skips step 4 (recursive B&B). Directly aligned with Evil mode
    since the adversary literally returns the bucket this strategy minimizes.
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
        best_key: tuple[int, float, int, str] | None = None
        best_guess = candidates[0]
        best_explanation: dict[str, float | int] = {}
        for guess in guesses:
            counts = self.table.partition_counts(guess, candidates)
            forced_size = evil_forced_bucket_size(counts)
            entropy = shannon_entropy(counts)
            in_candidate = 0 if guess in candidate_set else 1
            key = (forced_size, -entropy, in_candidate, guess)
            if self._break_tie(best_key, key):
                best_key = key
                best_guess = guess
                best_explanation = {
                    "pool_size": len(candidates),
                    "guess_pool_size": len(guesses),
                    "evil_forced_bucket": forced_size,
                    "entropy": round(entropy, 6),
                }
        decision = Decision(guess=best_guess, explanation=best_explanation)
        self.decision_cache[cache_key] = decision
        return decision

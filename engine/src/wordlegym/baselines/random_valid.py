from __future__ import annotations

import random

from ..decision import Decision
from ..hash_utils import decision_state_hash
from ..observation import Observation
from ..strategy import StrategyBase


class RandomValidStrategy(StrategyBase):
    """Baseline: pseudo-random pick over the current candidate set.

    The seed is a deterministic hash of the decision state, so identical states
    always produce identical guesses. This is a reproducible lower-bound control
    condition, not an algorithmic contribution.
    """

    def choose_guess(self, snapshot: Observation) -> Decision:
        cache_key = self._cache_key(snapshot)
        if cache_key in self.decision_cache:
            return self.decision_cache[cache_key]
        pool = self._candidate_pool(snapshot)
        seed = int(decision_state_hash(snapshot)[:12], 16)
        decision = Decision(guess=random.Random(seed).choice(pool), explanation={"seed": seed, "pool_size": len(pool)})
        self.decision_cache[cache_key] = decision
        return decision

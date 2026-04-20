from __future__ import annotations

from collections import Counter

from ..decision import Decision
from ..observation import Observation
from ..strategy import StrategyBase


class LetterFrequencyStrategy(StrategyBase):
    """Baseline: cheap candidate-only heuristic.

    Scores each candidate by a weighted sum of positional letter frequency and
    global unique-letter frequency within the current candidate set. The ``0.4``
    global weight is a heuristic design choice, not derived from an optimality
    argument; this strategy does not reason about feedback-pattern partitions,
    so it may overvalue common letters that fail to split the candidate set.
    """

    def choose_guess(self, snapshot: Observation) -> Decision:
        cache_key = self._cache_key(snapshot)
        if cache_key in self.decision_cache:
            return self.decision_cache[cache_key]
        pool = self._candidate_pool(snapshot)
        positional = [Counter(word[index] for word in pool) for index in range(5)]
        global_counts = Counter(letter for word in pool for letter in set(word))
        best_score = -1.0
        best_guess = pool[0]
        explanation: dict[str, float | int | str] = {}
        for guess in pool:
            seen: set[str] = set()
            global_score = 0
            for letter in guess:
                if letter not in seen:
                    global_score += global_counts[letter]
                    seen.add(letter)
            positional_score = sum(positional[index][letter] for index, letter in enumerate(guess))
            score = positional_score + (0.4 * global_score)
            if score > best_score or (score == best_score and guess < best_guess):
                best_score = score
                best_guess = guess
                explanation = {
                    "score": round(score, 4),
                    "global_score": global_score,
                    "positional_score": positional_score,
                    "pool_size": len(pool),
                }
        decision = Decision(guess=best_guess, explanation=explanation)
        self.decision_cache[cache_key] = decision
        return decision

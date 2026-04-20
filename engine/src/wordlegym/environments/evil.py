from __future__ import annotations

from collections import defaultdict

from ..feedback import is_all_correct, pattern_counts, pattern_to_text, score_guess
from .base import BaseEnvironment, GameConfig


class EvilEnvironment(BaseEnvironment):
    mode = "evil"

    def reset(self, config: GameConfig) -> None:
        self.max_turns = config.max_turns
        self.guesses = []
        self.feedbacks = []
        self.candidate_words = self.corpus.answers
        self.solved = False

    def apply_guess(self, guess: str) -> int:
        normalized = self._validate_guess(guess)
        buckets: dict[int, list[str]] = defaultdict(list)
        for candidate in self.candidate_words:
            buckets[score_guess(normalized, candidate)].append(candidate)

        def bucket_key(item: tuple[int, list[str]]) -> tuple[int, int, int, tuple[int, ...]]:
            pattern, words = item
            greens, yellows = pattern_counts(pattern)
            digits = tuple(int(value) for value in pattern_to_text(pattern, absent="0", present="1", correct="2"))
            return (-len(words), greens, yellows, digits)

        pattern, survivors = min(buckets.items(), key=bucket_key)
        self.guesses.append(normalized)
        self.feedbacks.append(pattern)
        self.candidate_words = tuple(sorted(survivors))
        self.solved = is_all_correct(pattern) and len(self.candidate_words) == 1
        return pattern

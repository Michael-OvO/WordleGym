from __future__ import annotations

from ..corpus import WordCorpus
from ..feedback import is_all_correct, score_guess
from .base import BaseEnvironment, GameConfig


class StandardEnvironment(BaseEnvironment):
    mode = "standard"

    def __init__(self, corpus: WordCorpus) -> None:
        super().__init__(corpus)
        self.hidden_answer = corpus.answers[0]

    def reset(self, config: GameConfig) -> None:
        self.hidden_answer = config.hidden_answer or self.corpus.answers[0]
        self.max_turns = config.max_turns
        self.guesses = []
        self.feedbacks = []
        self.candidate_words = self.corpus.answers
        self.solved = False

    def apply_guess(self, guess: str) -> int:
        normalized = self._validate_guess(guess)
        pattern = score_guess(normalized, self.hidden_answer)
        self.guesses.append(normalized)
        self.feedbacks.append(pattern)
        self.candidate_words = tuple(
            candidate for candidate in self.candidate_words if score_guess(normalized, candidate) == pattern
        )
        self.solved = is_all_correct(pattern)
        return pattern

from __future__ import annotations

import random
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass

from .corpus import WordCorpus
from .feedback import is_all_correct, pattern_counts, pattern_to_text, score_guess
from .models import GameSnapshot, ModePosterior


@dataclass
class GameConfig:
    hidden_answer: str | None = None
    hidden_mode: str | None = None
    max_turns: int | None = None
    mode_prior: float = 0.5
    seed: int = 7


class BaseEnvironment(ABC):
    mode: str

    def __init__(self, corpus: WordCorpus) -> None:
        self.corpus = corpus
        self.max_turns: int | None = None
        self.guesses: list[str] = []
        self.feedbacks: list[int] = []
        self.candidate_words: tuple[str, ...] = corpus.answers
        self.solved = False

    @abstractmethod
    def reset(self, config: GameConfig) -> None:
        raise NotImplementedError

    @abstractmethod
    def apply_guess(self, guess: str) -> int:
        raise NotImplementedError

    def is_terminal(self) -> bool:
        return self.solved or self.is_exhausted()

    def is_exhausted(self) -> bool:
        return self.max_turns is not None and len(self.guesses) >= self.max_turns and not self.solved

    def snapshot(self) -> GameSnapshot:
        return GameSnapshot(
            mode=self.mode,
            turn=len(self.guesses),
            max_turns=self.max_turns,
            guesses=tuple(self.guesses),
            feedbacks=tuple(self.feedbacks),
            solved=self.solved,
            exhausted=self.is_exhausted(),
            candidate_words=self.candidate_words,
        )

    def _validate_guess(self, guess: str) -> str:
        normalized = guess.lower()
        if not self.corpus.validate_guess(normalized):
            raise ValueError(f"Invalid guess: {guess}")
        if self.is_terminal():
            raise ValueError("Game is already terminal.")
        return normalized


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


class UnknownEnvironment(BaseEnvironment):
    mode = "unknown"

    def __init__(self, corpus: WordCorpus) -> None:
        super().__init__(corpus)
        self.standard_env = StandardEnvironment(corpus)
        self.evil_env = EvilEnvironment(corpus)
        self.hidden_mode = "standard"
        self.mode_prior = 0.5
        self.random = random.Random(7)
        self.standard_consistent = True
        self.evil_consistent = True
        self.standard_candidate_words = corpus.answers
        self.evil_candidate_words = corpus.answers

    def reset(self, config: GameConfig) -> None:
        self.max_turns = config.max_turns
        self.mode_prior = config.mode_prior
        self.random = random.Random(config.seed)
        self.hidden_mode = config.hidden_mode or ("evil" if self.random.random() < config.mode_prior else "standard")
        self.standard_env.reset(GameConfig(hidden_answer=config.hidden_answer, max_turns=config.max_turns))
        self.evil_env.reset(GameConfig(max_turns=config.max_turns))
        self.guesses = []
        self.feedbacks = []
        self.candidate_words = self.corpus.answers
        self.standard_candidate_words = self.corpus.answers
        self.evil_candidate_words = self.corpus.answers
        self.standard_consistent = True
        self.evil_consistent = True
        self.solved = False

    def apply_guess(self, guess: str) -> int:
        normalized = self._validate_guess(guess)
        if self.hidden_mode == "standard":
            pattern = self.standard_env.apply_guess(normalized)
        else:
            pattern = self.evil_env.apply_guess(normalized)

        self.guesses.append(normalized)
        self.feedbacks.append(pattern)
        self.standard_candidate_words = tuple(
            candidate
            for candidate in self.standard_candidate_words
            if score_guess(normalized, candidate) == pattern
        )
        self.standard_consistent = bool(self.standard_candidate_words)

        if not self.evil_consistent:
            self.evil_candidate_words = ()
        else:
            expected_evil_pattern = self._evil_expected_pattern(self.guesses[:-1], self.feedbacks[:-1], normalized)
            if expected_evil_pattern != pattern:
                self.evil_consistent = False
                self.evil_candidate_words = ()
            else:
                self.evil_candidate_words = tuple(
                    candidate for candidate in self.evil_candidate_words if score_guess(normalized, candidate) == pattern
                )
                self.evil_consistent = bool(self.evil_candidate_words)

        combined = set(self.standard_candidate_words) | set(self.evil_candidate_words)
        self.candidate_words = tuple(sorted(combined or set(self.standard_candidate_words)))
        self.solved = self.standard_env.solved if self.hidden_mode == "standard" else self.evil_env.solved
        return pattern

    def snapshot(self) -> GameSnapshot:
        posterior = self._mode_posterior()
        return GameSnapshot(
            mode=self.mode,
            turn=len(self.guesses),
            max_turns=self.max_turns,
            guesses=tuple(self.guesses),
            feedbacks=tuple(self.feedbacks),
            solved=self.solved,
            exhausted=self.is_exhausted(),
            candidate_words=self.candidate_words,
            standard_candidate_words=self.standard_candidate_words,
            evil_candidate_words=self.evil_candidate_words,
            mode_posterior=posterior,
            standard_consistent=self.standard_consistent,
            evil_consistent=self.evil_consistent,
        )

    def _mode_posterior(self) -> ModePosterior:
        initial_count = len(self.corpus.answers)
        standard_likelihood = len(self.standard_candidate_words) / initial_count if self.standard_consistent else 0.0
        evil_likelihood = 1.0 if self.evil_consistent else 0.0
        unnormalized_standard = (1.0 - self.mode_prior) * standard_likelihood
        unnormalized_evil = self.mode_prior * evil_likelihood
        total = unnormalized_standard + unnormalized_evil
        if total == 0:
            return ModePosterior(standard=0.5, evil=0.5)
        return ModePosterior(
            standard=unnormalized_standard / total,
            evil=unnormalized_evil / total,
        )

    def _evil_expected_pattern(
        self, prior_guesses: list[str], prior_feedbacks: list[int], next_guess: str
    ) -> int:
        candidates = self.corpus.answers
        for guess, pattern in zip(prior_guesses, prior_feedbacks):
            candidates = tuple(candidate for candidate in candidates if score_guess(guess, candidate) == pattern)

        buckets: dict[int, list[str]] = defaultdict(list)
        for candidate in candidates:
            buckets[score_guess(next_guess, candidate)].append(candidate)

        def bucket_key(item: tuple[int, list[str]]) -> tuple[int, int, int, tuple[int, ...]]:
            pattern, words = item
            greens, yellows = pattern_counts(pattern)
            digits = tuple(int(value) for value in pattern_to_text(pattern, absent="0", present="1", correct="2"))
            return (-len(words), greens, yellows, digits)

        return min(buckets.items(), key=bucket_key)[0]

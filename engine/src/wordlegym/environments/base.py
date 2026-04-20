from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from ..corpus import WordCorpus
from ..observation import Observation


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

    def snapshot(self) -> Observation:
        return Observation(
            mode=self.mode,
            turn=len(self.guesses),
            max_turns=self.max_turns,
            guesses=tuple(self.guesses),
            feedbacks=tuple(self.feedbacks),
            solved=self.solved,
            exhausted=self.is_exhausted(),
            candidates=self.candidate_words,
        )

    def _validate_guess(self, guess: str) -> str:
        normalized = guess.lower()
        if not self.corpus.validate_guess(normalized):
            raise ValueError(f"Invalid guess: {guess}")
        if self.is_terminal():
            raise ValueError("Game is already terminal.")
        return normalized

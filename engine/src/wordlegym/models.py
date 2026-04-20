from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from .feedback import TileState  # re-export for backward-compat within Phase 1


@dataclass(frozen=True)
class ModePosterior:
    standard: float
    evil: float

    def to_dict(self) -> dict[str, float]:
        return {"standard": round(self.standard, 6), "evil": round(self.evil, 6)}


@dataclass(frozen=True)
class StrategyDecision:
    guess: str
    explanation: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class GameSnapshot:
    mode: str
    turn: int
    max_turns: int | None
    guesses: tuple[str, ...]
    feedbacks: tuple[int, ...]
    solved: bool
    exhausted: bool
    candidate_words: tuple[str, ...]
    standard_candidate_words: tuple[str, ...] | None = None
    evil_candidate_words: tuple[str, ...] | None = None
    mode_posterior: ModePosterior | None = None
    standard_consistent: bool = True
    evil_consistent: bool = False

    @property
    def remaining_candidates(self) -> int:
        return len(self.candidate_words)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        if self.mode_posterior is not None:
            payload["mode_posterior"] = self.mode_posterior.to_dict()
        return payload


@dataclass(frozen=True)
class GuessTraceStep:
    turn: int
    guess: str
    pattern: int
    pattern_text: str
    pattern_emoji: str
    remaining_candidates: int
    candidate_preview: tuple[str, ...]
    explanation: dict[str, Any]
    mode_posterior: dict[str, float] | None = None
    standard_candidates: int | None = None
    evil_candidates: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class GameTrace:
    mode: str
    branch: str
    strategy_id: str
    hidden_answer: str | None
    hidden_mode: str | None
    turns: int
    solved: bool
    exhausted: bool
    remaining_candidates: int
    steps: tuple[GuessTraceStep, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "branch": self.branch,
            "strategy_id": self.strategy_id,
            "hidden_answer": self.hidden_answer,
            "hidden_mode": self.hidden_mode,
            "turns": self.turns,
            "solved": self.solved,
            "exhausted": self.exhausted,
            "remaining_candidates": self.remaining_candidates,
            "steps": [step.to_dict() for step in self.steps],
        }


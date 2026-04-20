from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


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

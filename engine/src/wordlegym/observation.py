from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import IntEnum
from typing import Any


class TileState(IntEnum):
    ABSENT = 0
    PRESENT = 1
    CORRECT = 2


@dataclass(frozen=True)
class ModePosterior:
    standard: float
    evil: float

    def to_dict(self) -> dict[str, float]:
        return {"standard": round(self.standard, 6), "evil": round(self.evil, 6)}


@dataclass(frozen=True)
class Observation:
    mode: str
    turn: int
    max_turns: int | None
    guesses: tuple[str, ...]
    feedbacks: tuple[int, ...]
    solved: bool
    exhausted: bool
    candidates: tuple[str, ...]
    standard_candidates: tuple[str, ...] | None = None
    evil_candidates: tuple[str, ...] | None = None
    mode_posterior: ModePosterior | None = None
    standard_consistent: bool = True
    evil_consistent: bool = False

    @property
    def remaining_candidates(self) -> int:
        return len(self.candidates)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        if self.mode_posterior is not None:
            payload["mode_posterior"] = self.mode_posterior.to_dict()
        return payload

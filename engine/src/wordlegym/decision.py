from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping


@dataclass(frozen=True)
class Decision:
    guess: str
    explanation: Mapping[str, Any] = field(default_factory=dict)

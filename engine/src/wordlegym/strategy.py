from __future__ import annotations

from dataclasses import dataclass, field

from .analysis import FeedbackTable
from .corpus import WordCorpus
from .decision import Decision
from .observation import Observation


@dataclass
class StrategyBase:
    corpus: WordCorpus
    table: FeedbackTable
    id: str
    label: str
    objective: str
    decision_cache: dict[tuple[object, ...], Decision] = field(default_factory=dict, init=False, repr=False)

    def choose_guess(self, snapshot: Observation) -> Decision:
        raise NotImplementedError

    def _candidate_pool(self, snapshot: Observation) -> tuple[str, ...]:
        if snapshot.mode == "unknown":
            standard = snapshot.standard_candidates or ()
            evil = snapshot.evil_candidates or ()
            combined = tuple(sorted(set(standard) | set(evil)))
            return combined or snapshot.candidates
        return snapshot.candidates

    def _guess_pool(self, snapshot: Observation) -> tuple[str, ...]:
        return self._candidate_pool(snapshot)

    def _break_tie(self, current: tuple | None, challenger: tuple) -> bool:
        return current is None or challenger < current

    def _cache_key(self, snapshot: Observation) -> tuple[object, ...]:
        if snapshot.mode == "unknown":
            posterior = snapshot.mode_posterior.to_dict() if snapshot.mode_posterior is not None else {"standard": 0.5, "evil": 0.5}
            return (
                snapshot.mode,
                snapshot.standard_candidates or (),
                snapshot.evil_candidates or (),
                round(posterior["standard"], 6),
                round(posterior["evil"], 6),
            )
        return (snapshot.mode, snapshot.candidates)

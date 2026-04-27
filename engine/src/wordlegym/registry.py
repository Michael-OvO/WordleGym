from __future__ import annotations

from typing import NamedTuple

from .analysis import FeedbackTable
from .baselines.evil_dp import EvilDPStrategy
from .baselines.letter_frequency import LetterFrequencyStrategy
from .baselines.partition import EntropyStrategy, MinimaxStrategy
from .baselines.posterior_expectimax import PosteriorExpectimaxStrategy
from .baselines.random_valid import RandomValidStrategy
from .corpus import WordCorpus
from .strategy import StrategyBase


class StrategyMetadata(NamedTuple):
    cls: type[StrategyBase]
    label: str
    objective: str
    tier: str
    caveat: str


STRATEGY_REGISTRY: dict[str, StrategyMetadata] = {
    "random-valid": StrategyMetadata(
        cls=RandomValidStrategy,
        label="Random Valid",
        objective="Deterministic seeded random play over feasible answers.",
        tier="baseline",
        caveat="Reproducible lower-bound control, not a competitive solver.",
    ),
    "letter-frequency": StrategyMetadata(
        cls=LetterFrequencyStrategy,
        label="Letter Frequency",
        objective="Maximize weighted letter coverage over feasible answers.",
        tier="baseline",
        caveat="Ignores feedback-pattern partitions; 0.4 global weight is heuristic.",
    ),
    "expected-entropy": StrategyMetadata(
        cls=EntropyStrategy,
        label="Expected Entropy",
        objective="Maximize Shannon information gain per guess.",
        tier="core",
        caveat="Greedy per-turn; high entropy can leave awkward subproblems later.",
    ),
    "minimax": StrategyMetadata(
        cls=MinimaxStrategy,
        label="Minimax",
        objective="Minimize the worst-case remaining candidate bucket.",
        tier="core",
        caveat="One-ply worst case; not globally minimax-optimal over the decision tree.",
    ),
    "posterior-expectimax": StrategyMetadata(
        cls=PosteriorExpectimaxStrategy,
        label="Posterior Expectimax",
        objective="One-step Bayesian expectimax: q * E[|C_next|] + (1 - q) * |T(C,g)|.",
        tier="aggregate-aware",
        caveat="Depth-1 approximation of the Bayesian limited-depth expectimax from the spec.",
    ),
    "evil-dp": StrategyMetadata(
        cls=EvilDPStrategy,
        label="Evil DP",
        objective="Memoized shortest-path DP D(C) for Evil mode (beam search K=100, ~83s first-run, cached to disk).",
        tier="optimal",
        caveat="Evil mode only -- Standard and Unknown fall back to one-ply evil-forced-bucket greedy.",
    ),
}


def build_strategies(corpus: WordCorpus) -> dict[str, StrategyBase]:
    table = FeedbackTable(corpus)
    return {
        strategy_id: meta.cls(corpus=corpus, table=table, id=strategy_id, label=meta.label, objective=meta.objective)
        for strategy_id, meta in STRATEGY_REGISTRY.items()
    }

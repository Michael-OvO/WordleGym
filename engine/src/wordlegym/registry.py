from __future__ import annotations

from typing import NamedTuple

from .analysis import FeedbackTable
from .baselines.evil_dp import EvilDPStrategy
from .baselines.evil_shortest_path import EvilShortestPathStrategy
from .baselines.letter_frequency import LetterFrequencyStrategy
from .baselines.partition import (
    CandidateEliminationStrategy,
    EntropyStrategy,
    MinimaxStrategy,
)
from .baselines.posterior_expectimax import PosteriorExpectimaxStrategy
from .baselines.posterior_hybrid import PosteriorHybridStrategy
from .baselines.random_valid import RandomValidStrategy
from .baselines.robust_scalarization import RobustScalarizationStrategy
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
    "candidate-elimination": StrategyMetadata(
        cls=CandidateEliminationStrategy,
        label="Candidate Elimination",
        objective="Minimize expected remaining candidates (one-step Bayes objective).",
        tier="core",
        caveat="Greedy per-turn; does not guarantee globally optimal expected guesses.",
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
    "posterior-hybrid": StrategyMetadata(
        cls=PosteriorHybridStrategy,
        label="Posterior Hybrid",
        objective="Posterior-weighted blend of standard-mode entropy and evil-mode worst-case reduction.",
        tier="experimental",
        caveat="Heuristic blend -- not the Bayes-optimal Unknown-mode policy.",
    ),
    "evil-shortest-path": StrategyMetadata(
        cls=EvilShortestPathStrategy,
        label="Evil Shortest Path",
        objective="Minimize the evil-forced successor bucket |T(C,g)| (one-ply approximation of D(C)).",
        tier="aggregate-aware",
        caveat="One-ply greedy -- exact shortest-path D(C) requires recursive branch-and-bound.",
    ),
    "posterior-expectimax": StrategyMetadata(
        cls=PosteriorExpectimaxStrategy,
        label="Posterior Expectimax",
        objective="One-step Bayesian expectimax: q * E[|C_next|] + (1 - q) * |T(C,g)|.",
        tier="aggregate-aware",
        caveat="Depth-1 approximation of the Bayesian limited-depth expectimax from the spec.",
    ),
    "robust-scalarization": StrategyMetadata(
        cls=RobustScalarizationStrategy,
        label="Robust Scalarization",
        objective="Minimax across modes: minimize max(E[|C_next|], |T(C,g)|).",
        tier="aggregate-aware",
        caveat="One-step scalarization -- true robust optimum searches the Pareto frontier recursively.",
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

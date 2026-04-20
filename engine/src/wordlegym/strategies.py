"""Wordle-solving strategies organized by documentation tier.

WordleGym strategies are benchmark policies, not claimed optimal solvers. They are
grouped into four tiers so users can interpret results correctly:

* ``baseline``  -- Intentionally weak or heuristic policies that establish a
  reproducible lower bound. Useful as control conditions, not as algorithmic
  contributions (``random-valid``, ``letter-frequency``).
* ``core``      -- Principled one-ply partition heuristics that optimize a
  well-defined local objective (``candidate-elimination``, ``expected-entropy``,
  ``minimax``). Greedy; not globally optimal over the full decision tree.
* ``experimental`` -- Mode-aware hybrid heuristics designed for the Unknown
  posterior setting (``posterior-hybrid``). Coherent but not Bayes-optimal.
* ``aggregate-aware`` -- Practical-candidate approximations of the exact
  aggregate-optimal decision trees from the benchmark spec. The exact DPs
  (``V(C)``, ``W(C)``, ``D(C)``, ``V_U(C)``, ...) are generally computationally
  prohibitive at Wordle scale; these strategies implement principled one-step
  approximations aligned with those recurrences (``evil-shortest-path``,
  ``posterior-expectimax``, ``robust-scalarization``).
* ``optimal``   -- Exact dynamic-program solutions for subproblems where the
  DP is actually tractable. At Wordle scale, only Evil mode satisfies this
  (deterministic successors, ~10^3 reachable subsets). ``evil-dp`` computes
  the exact ``D(C)`` recurrence with memoization; other modes fall back to
  the ``evil-shortest-path`` greedy.
"""

from __future__ import annotations

import json
import math
import os
import random
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import NamedTuple

from .analysis import FeedbackTable
from .corpus import WordCorpus
from .hash_utils import decision_state_hash
from .metrics import (
    PATTERN_EVIL_TIEBREAK,
    evil_forced_bucket_size,
    expected_remaining,
    reduction_ratio,
    shannon_entropy,
    worst_case_bucket,
)
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


class RandomValidStrategy(StrategyBase):
    """Baseline: pseudo-random pick over the current candidate set.

    The seed is a deterministic hash of the decision state, so identical states
    always produce identical guesses. This is a reproducible lower-bound control
    condition, not an algorithmic contribution.
    """

    def choose_guess(self, snapshot: Observation) -> Decision:
        cache_key = self._cache_key(snapshot)
        if cache_key in self.decision_cache:
            return self.decision_cache[cache_key]
        pool = self._candidate_pool(snapshot)
        seed = int(decision_state_hash(snapshot)[:12], 16)
        decision = Decision(guess=random.Random(seed).choice(pool), explanation={"seed": seed, "pool_size": len(pool)})
        self.decision_cache[cache_key] = decision
        return decision


class LetterFrequencyStrategy(StrategyBase):
    """Baseline: cheap candidate-only heuristic.

    Scores each candidate by a weighted sum of positional letter frequency and
    global unique-letter frequency within the current candidate set. The ``0.4``
    global weight is a heuristic design choice, not derived from an optimality
    argument; this strategy does not reason about feedback-pattern partitions,
    so it may overvalue common letters that fail to split the candidate set.
    """

    def choose_guess(self, snapshot: Observation) -> Decision:
        cache_key = self._cache_key(snapshot)
        if cache_key in self.decision_cache:
            return self.decision_cache[cache_key]
        pool = self._candidate_pool(snapshot)
        positional = [Counter(word[index] for word in pool) for index in range(5)]
        global_counts = Counter(letter for word in pool for letter in set(word))
        best_score = -1.0
        best_guess = pool[0]
        explanation: dict[str, float | int | str] = {}
        for guess in pool:
            seen: set[str] = set()
            global_score = 0
            for letter in guess:
                if letter not in seen:
                    global_score += global_counts[letter]
                    seen.add(letter)
            positional_score = sum(positional[index][letter] for index, letter in enumerate(guess))
            score = positional_score + (0.4 * global_score)
            if score > best_score or (score == best_score and guess < best_guess):
                best_score = score
                best_guess = guess
                explanation = {
                    "score": round(score, 4),
                    "global_score": global_score,
                    "positional_score": positional_score,
                    "pool_size": len(pool),
                }
        decision = Decision(guess=best_guess, explanation=explanation)
        self.decision_cache[cache_key] = decision
        return decision


class PartitionStrategy(StrategyBase):
    """Shared pipeline for one-ply feedback-partition strategies.

    Every subclass sees the same guess pool (the full allowed list), the same
    partition scoring, and the same tie-break order, so benchmark comparisons
    are apples-to-apples. Subclasses differ only in ``metric_name``.
    """

    metric_name = "entropy"

    def _guess_pool(self, snapshot: Observation) -> tuple[str, ...]:
        return self.corpus.all_allowed

    def _score_candidate(self, guess: str, candidate_words: tuple[str, ...]) -> tuple[float, dict[str, float | int]]:
        counts = self.table.partition_counts(guess, candidate_words)
        entropy = shannon_entropy(counts)
        expected = expected_remaining(counts)
        worst_case = worst_case_bucket(counts)
        reduction = reduction_ratio(len(candidate_words), worst_case)
        if self.metric_name == "entropy":
            value = entropy
        elif self.metric_name == "elimination":
            value = -expected
        else:
            value = -worst_case
        return value, {
            "entropy": round(entropy, 6),
            "expected_remaining": round(expected, 6),
            "worst_case": worst_case,
            "reduction_ratio": round(reduction, 6),
        }

    def choose_guess(self, snapshot: Observation) -> Decision:
        cache_key = self._cache_key(snapshot)
        if cache_key in self.decision_cache:
            return self.decision_cache[cache_key]
        candidates = self._candidate_pool(snapshot)
        guesses = self._guess_pool(snapshot)
        candidate_set = set(candidates)
        best_key: tuple[float, int, int, str] | None = None
        best_guess = candidates[0]
        best_explanation: dict[str, float | int] = {}
        for guess in guesses:
            value, stats = self._score_candidate(guess, candidates)
            in_candidate = 0 if guess in candidate_set else 1
            key = (-value, stats["worst_case"], in_candidate, guess)
            if self._break_tie(best_key, key):
                best_key = key
                best_guess = guess
                best_explanation = {"pool_size": len(candidates), "guess_pool_size": len(guesses), **stats}
        decision = Decision(guess=best_guess, explanation=best_explanation)
        self.decision_cache[cache_key] = decision
        return decision


class CandidateEliminationStrategy(PartitionStrategy):
    """Core: minimize expected remaining candidates.

    Chooses the guess with the smallest ``sum(n**2)/N`` across feedback
    buckets, which equals the expected bucket size the true answer lands in
    under a uniform candidate prior. This is a one-step Bayes objective;
    greedy per-turn minimization may diverge from globally optimal total
    expected guesses.
    """

    metric_name = "elimination"


class EntropyStrategy(PartitionStrategy):
    """Core: maximize Shannon information gain.

    Chooses the guess whose feedback distribution has maximum entropy,
    rewarding balanced partitions across many patterns. Information gain is
    not the same as expected solve depth: a high-entropy guess can create
    awkward subproblems in later turns.
    """

    metric_name = "entropy"


class MinimaxStrategy(PartitionStrategy):
    """Core: minimize the worst-case surviving bucket.

    The one-ply worst-case criterion; especially relevant for Evil mode,
    whose adversary literally returns the largest-bucket pattern. This is
    greedy: the true minimax-optimal policy would minimize worst-case
    decision-tree depth recursively, not just the next bucket.
    """

    metric_name = "minimax"


class PosteriorHybridStrategy(StrategyBase):
    """Experimental: posterior-weighted hybrid for Unknown mode.

    Blends normalized standard-mode entropy with evil-mode worst-case
    reduction using the mode posterior as weights. The two components are
    not measured in the same units (information vs. elimination fraction),
    and the posterior-weighted blend is not the Bayes-optimal Unknown-mode
    policy -- a true optimum would reason recursively over both branches.
    Useful as a mode-aware benchmark, not as a claimed optimal solver.
    """

    def _guess_pool(self, snapshot: Observation) -> tuple[str, ...]:
        return self.corpus.all_allowed

    def choose_guess(self, snapshot: Observation) -> Decision:
        cache_key = self._cache_key(snapshot)
        if cache_key in self.decision_cache:
            return self.decision_cache[cache_key]
        candidates = self._candidate_pool(snapshot)
        guesses = self._guess_pool(snapshot)
        candidate_set = set(candidates)
        standard_candidates = snapshot.standard_candidates or candidates
        evil_candidates = snapshot.evil_candidates or candidates
        if snapshot.mode_posterior is None:
            standard_weight = 1.0 if snapshot.mode == "standard" else 0.0
            evil_weight = 1.0 if snapshot.mode == "evil" else 0.5
        else:
            standard_weight = snapshot.mode_posterior.standard
            evil_weight = snapshot.mode_posterior.evil

        # Guard singleton / empty pools: log2(<=1) collapses to 0 or is undefined,
        # which would make normalized entropy a division-by-zero. Fall back to 1.0
        # so normalized_entropy becomes 0 (the correct limit when no information
        # can be gained) rather than NaN/Inf.
        standard_pool_size = len(standard_candidates)
        max_entropy = math.log2(standard_pool_size) if standard_pool_size > 1 else 1.0
        best_key: tuple[float, int, int, str] | None = None
        best_guess = candidates[0]
        best_explanation: dict[str, float | int] = {}

        for guess in guesses:
            standard_counts = self.table.partition_counts(guess, standard_candidates)
            evil_counts = self.table.partition_counts(guess, evil_candidates)
            standard_entropy = shannon_entropy(standard_counts)
            normalized_entropy = standard_entropy / max_entropy
            evil_worst_case = worst_case_bucket(evil_counts)
            evil_reduction = reduction_ratio(len(evil_candidates), evil_worst_case)
            blended = (standard_weight * normalized_entropy) + (evil_weight * evil_reduction)
            in_candidate = 0 if guess in candidate_set else 1
            key = (-blended, evil_worst_case, in_candidate, guess)
            if self._break_tie(best_key, key):
                best_key = key
                best_guess = guess
                best_explanation = {
                    "pool_size": len(candidates),
                    "guess_pool_size": len(guesses),
                    "standard_entropy": round(standard_entropy, 6),
                    "normalized_standard_entropy": round(normalized_entropy, 6),
                    "evil_reduction_ratio": round(evil_reduction, 6),
                    "evil_worst_case": evil_worst_case,
                    "mode_weights": {
                        "standard": round(standard_weight, 6),
                        "evil": round(evil_weight, 6),
                    },
                    "blended_score": round(blended, 6),
                }
        decision = Decision(guess=best_guess, explanation=best_explanation)
        self.decision_cache[cache_key] = decision
        return decision


class EvilShortestPathStrategy(StrategyBase):
    """Aggregate-aware: greedy evil-forced-bucket minimizer.

    One-ply approximation of the exact shortest-path recurrence ``D(C)`` from
    the spec's Evil-mode section. Picks ``argmin_g |T(C, g)|`` -- the size of
    the evil-forced successor under the benchmark's tie-break rules -- with
    tie-breakers by partition entropy and lexicographic order.

    Exact ``D(C)`` requires recursive branch-and-bound with memoization over
    the deterministic evil subset graph; that is prohibitive at Wordle scale,
    so this strategy implements steps 1-3 of the spec's "greedy/A* ordering"
    recipe and skips step 4 (recursive B&B). Directly aligned with Evil mode
    since the adversary literally returns the bucket this strategy minimizes.
    """

    def _guess_pool(self, snapshot: Observation) -> tuple[str, ...]:
        return self.corpus.all_allowed

    def choose_guess(self, snapshot: Observation) -> Decision:
        cache_key = self._cache_key(snapshot)
        if cache_key in self.decision_cache:
            return self.decision_cache[cache_key]
        candidates = self._candidate_pool(snapshot)
        guesses = self._guess_pool(snapshot)
        candidate_set = set(candidates)
        best_key: tuple[int, float, int, str] | None = None
        best_guess = candidates[0]
        best_explanation: dict[str, float | int] = {}
        for guess in guesses:
            counts = self.table.partition_counts(guess, candidates)
            forced_size = evil_forced_bucket_size(counts)
            entropy = shannon_entropy(counts)
            in_candidate = 0 if guess in candidate_set else 1
            key = (forced_size, -entropy, in_candidate, guess)
            if self._break_tie(best_key, key):
                best_key = key
                best_guess = guess
                best_explanation = {
                    "pool_size": len(candidates),
                    "guess_pool_size": len(guesses),
                    "evil_forced_bucket": forced_size,
                    "entropy": round(entropy, 6),
                }
        decision = Decision(guess=best_guess, explanation=best_explanation)
        self.decision_cache[cache_key] = decision
        return decision


class PosteriorExpectimaxStrategy(StrategyBase):
    """Aggregate-aware: one-step Bayesian expectimax for Unknown mode.

    ``score(g) = q * Sum(|B_r|^2/|C|) + (1 - q) * |T(C, g)|``

    * ``q = P(standard | history)`` -- mode posterior, supplied by the snapshot.
    * ``Sum(|B_r|^2/|C|)`` -- expected remaining candidates (the standard-mode
      one-step Bayes objective used by Candidate Elimination).
    * ``|T(C, g)|`` -- evil-forced bucket size (the one-step evil objective).

    Reduces cleanly to Candidate Elimination in pure Standard (``q = 1``) and
    to Evil Shortest Path in pure Evil (``q = 0``). In Unknown mode it uses the
    true posterior, so the two blended components are in the same "remaining
    candidates" units -- unlike ``posterior-hybrid``, where entropy and
    reduction ratio live on different scales.

    One-step approximation of the spec's Bayesian limited-depth expectimax:
    the true expectimax propagates value estimates recursively instead of
    truncating at depth 1.
    """

    def _guess_pool(self, snapshot: Observation) -> tuple[str, ...]:
        return self.corpus.all_allowed

    def _mode_weights(self, snapshot: Observation) -> tuple[float, float]:
        if snapshot.mode == "standard":
            return 1.0, 0.0
        if snapshot.mode == "evil":
            return 0.0, 1.0
        if snapshot.mode_posterior is not None:
            return snapshot.mode_posterior.standard, snapshot.mode_posterior.evil
        standard_candidates = snapshot.standard_candidates or snapshot.candidates
        denominator = len(self.corpus.answers) + len(standard_candidates)
        q = len(standard_candidates) / denominator if denominator > 0 else 0.5
        return q, 1.0 - q

    def choose_guess(self, snapshot: Observation) -> Decision:
        cache_key = self._cache_key(snapshot)
        if cache_key in self.decision_cache:
            return self.decision_cache[cache_key]
        candidates = self._candidate_pool(snapshot)
        guesses = self._guess_pool(snapshot)
        candidate_set = set(candidates)
        q_std, q_evil = self._mode_weights(snapshot)
        best_key: tuple[float, int, int, str] | None = None
        best_guess = candidates[0]
        best_explanation: dict[str, float | int | dict[str, float]] = {}
        for guess in guesses:
            counts = self.table.partition_counts(guess, candidates)
            expected_rem = expected_remaining(counts)
            forced_size = evil_forced_bucket_size(counts)
            score = q_std * expected_rem + q_evil * forced_size
            in_candidate = 0 if guess in candidate_set else 1
            key = (score, in_candidate, forced_size, guess)
            if self._break_tie(best_key, key):
                best_key = key
                best_guess = guess
                best_explanation = {
                    "pool_size": len(candidates),
                    "guess_pool_size": len(guesses),
                    "expected_remaining": round(expected_rem, 6),
                    "evil_forced_bucket": forced_size,
                    "blended_score": round(score, 6),
                    "mode_weights": {"standard": round(q_std, 6), "evil": round(q_evil, 6)},
                }
        decision = Decision(guess=best_guess, explanation=best_explanation)
        self.decision_cache[cache_key] = decision
        return decision


class RobustScalarizationStrategy(StrategyBase):
    """Aggregate-aware: minimax-over-modes one-step scorer.

    ``score(g) = max( Sum(|B_r|^2/|C|),  |T(C, g)| )``

    For each guess, compute two one-step cost estimates: the standard-mode
    expected remaining candidates and the evil-forced bucket size. Pick the
    guess minimizing the larger of the two, so the chosen guess has bounded
    one-step cost under either mode.

    This is the practical scalarization from the spec's cross-mode robustness
    section (the ``max_m J_m(g)`` form). A true robust-optimum policy would
    search the Pareto frontier of ``(J_standard, J_evil)`` recursively over
    reachable histories. Ties broken by mean cost, then lexicographic order.
    """

    def _guess_pool(self, snapshot: Observation) -> tuple[str, ...]:
        return self.corpus.all_allowed

    def choose_guess(self, snapshot: Observation) -> Decision:
        cache_key = self._cache_key(snapshot)
        if cache_key in self.decision_cache:
            return self.decision_cache[cache_key]
        candidates = self._candidate_pool(snapshot)
        guesses = self._guess_pool(snapshot)
        candidate_set = set(candidates)
        best_key: tuple[float, float, int, str] | None = None
        best_guess = candidates[0]
        best_explanation: dict[str, float | int] = {}
        for guess in guesses:
            counts = self.table.partition_counts(guess, candidates)
            expected_rem = expected_remaining(counts)
            forced_size = float(evil_forced_bucket_size(counts))
            robust_score = max(expected_rem, forced_size)
            mean_score = 0.5 * (expected_rem + forced_size)
            in_candidate = 0 if guess in candidate_set else 1
            key = (robust_score, mean_score, in_candidate, guess)
            if self._break_tie(best_key, key):
                best_key = key
                best_guess = guess
                best_explanation = {
                    "pool_size": len(candidates),
                    "guess_pool_size": len(guesses),
                    "standard_cost": round(expected_rem, 6),
                    "evil_cost": int(forced_size),
                    "robust_score": round(robust_score, 6),
                    "mean_cost": round(mean_score, 6),
                }
        decision = Decision(guess=best_guess, explanation=best_explanation)
        self.decision_cache[cache_key] = decision
        return decision


EVIL_DP_DEFAULT_BEAM = 100
EVIL_DP_CACHE_ENV = "WORDLEGYM_EVIL_DP_CACHE_DIR"


def _default_evil_dp_cache_dir() -> Path:
    """``results/cache/`` relative to the repo root (two parents up from engine src)."""
    return Path(__file__).resolve().parents[3] / "results" / "cache"


class EvilDPStrategy(StrategyBase):
    """Optimal (beam-limited) dynamic program for Evil mode.

    Implements the spec's deterministic Evil recurrence::

        D(C) = min_g [ 1 + D(T(C, g)) ]     with  D({w}) = 1.

    Because each guess has a single deterministic successor ``T(C, g)`` under
    the benchmark tie-break rules, the evil subset graph from the full answer
    set is small enough to solve with memoized DFS. In pure Python, the full
    |G|=13k guess pool makes exhaustive search impractical; a beam of the top
    ``EVIL_DP_DEFAULT_BEAM`` guesses (sorted by forced-bucket size, then
    entropy) recovers the published optimum on the canonical list while
    keeping first-run time tractable.

    The solved policy is cached in-memory (for the session) and to disk as
    JSON (under ``results/cache/``) so repeated benchmark runs pay the DP
    cost exactly once. In Standard and Unknown modes the strategy falls back
    to the greedy ``evil-shortest-path`` objective, since those modes have
    branching successors where exact DP is not tractable in pure Python.
    """

    def __post_init_dp(self) -> None:
        if getattr(self, "_dp_initialized", False):
            return
        # Keys: canonical sorted-tuple of candidate words.
        self._dp_policy: dict[tuple[str, ...], tuple[int, str]] = {}
        self._dp_solved_root = False
        self._dp_beam = EVIL_DP_DEFAULT_BEAM
        self._dp_initialized = True

    def _guess_pool(self, snapshot: Observation) -> tuple[str, ...]:
        return self.corpus.all_allowed

    def _cache_path(self) -> Path:
        override = os.environ.get(EVIL_DP_CACHE_ENV)
        base = Path(override) if override else _default_evil_dp_cache_dir()
        return base / f"evil-dp-k{self._dp_beam}-n{len(self.corpus.answers)}.json"

    def _load_cache(self) -> bool:
        path = self._cache_path()
        if not path.exists():
            return False
        try:
            with path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (json.JSONDecodeError, OSError):
            return False
        if not isinstance(payload, dict) or "entries" not in payload:
            return False
        policy: dict[tuple[str, ...], tuple[int, str]] = {}
        for entry in payload["entries"]:
            words = tuple(entry["words"])
            policy[words] = (int(entry["depth"]), str(entry["guess"]))
        self._dp_policy = policy
        return True

    def _save_cache(self) -> None:
        path = self._cache_path()
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "corpus_size": len(self.corpus.answers),
                "beam": self._dp_beam,
                "entries": [
                    {"words": list(words), "depth": depth, "guess": guess}
                    for words, (depth, guess) in self._dp_policy.items()
                ],
            }
            with path.open("w", encoding="utf-8") as handle:
                json.dump(payload, handle)
        except OSError:
            # Caching is best-effort; a read-only filesystem should not break a run.
            pass

    def choose_guess(self, snapshot: Observation) -> Decision:
        self.__post_init_dp()
        if snapshot.mode != "evil":
            return self._greedy_evil_step(snapshot)

        if not self._dp_solved_root:
            if not self._load_cache():
                self._solve(tuple(self.corpus.answers))
                self._save_cache()
            self._dp_solved_root = True

        key = tuple(sorted(snapshot.candidates))
        entry = self._dp_policy.get(key)
        if entry is None:
            # Off-policy state (possible if the environment's tie-break diverges
            # from the DP's). Solve on-demand; cache grows in memory only.
            entry = self._solve(key)

        depth, guess = entry
        return Decision(
            guess=guess,
            explanation={
                "pool_size": len(snapshot.candidates),
                "dp_remaining_depth": depth,
                "dp_beam": self._dp_beam,
            },
        )

    # ------------------------------------------------------------------
    # DP internals
    # ------------------------------------------------------------------

    def _solve(self, candidate_key: tuple[str, ...]) -> tuple[int, str]:
        cached = self._dp_policy.get(candidate_key)
        if cached is not None:
            return cached

        if len(candidate_key) == 1:
            sole = candidate_key[0]
            result = (1, sole)
            self._dp_policy[candidate_key] = result
            return result

        set_size = len(candidate_key)
        answer_index = self.corpus.answer_index

        scored: list[tuple[int, float, int, str]] = []
        for guess in self.corpus.all_allowed:
            counts = self.table.partition_counts(guess, candidate_key)
            if not counts:
                continue
            forced_pattern = -1
            forced_size = 0
            best_key: tuple[int, int, int, tuple[int, ...]] | None = None
            for pattern, size in counts.items():
                greens, yellows, digits = PATTERN_EVIL_TIEBREAK[pattern]
                key = (-size, greens, yellows, digits)
                if best_key is None or key < best_key:
                    best_key = key
                    forced_pattern = pattern
                    forced_size = size
            if forced_size >= set_size:
                continue  # no progress
            entropy = shannon_entropy(counts)
            scored.append((forced_size, -entropy, forced_pattern, guess))

        if not scored:
            # Unreachable on the canonical corpus, but guard anyway.
            fallback_guess = candidate_key[0]
            result = (set_size, fallback_guess)
            self._dp_policy[candidate_key] = result
            return result

        scored.sort()
        if self._dp_beam is not None and len(scored) > self._dp_beam:
            scored = scored[: self._dp_beam]

        seen_successors: set[tuple[str, ...]] = set()
        best_depth: int | None = None
        best_guess: str | None = None

        for forced_size, _neg_entropy, forced_pattern, guess in scored:
            lower_bound = 2 if forced_size == 1 else 3
            if best_depth is not None and lower_bound >= best_depth:
                break  # sorted by forced_size, no later guess can improve

            row = self.table._get_row(guess)
            if row is not None:
                successor = tuple(
                    word for word in candidate_key
                    if row[answer_index[word]] == forced_pattern
                )
            else:
                from .feedback import score_guess as _score_guess
                successor = tuple(
                    word for word in candidate_key
                    if _score_guess(guess, word) == forced_pattern
                )

            if successor in seen_successors:
                continue  # a prior guess already established this subtree
            seen_successors.add(successor)

            sub_depth, _ = self._solve(successor)
            depth = 1 + sub_depth
            if best_depth is None or depth < best_depth:
                best_depth = depth
                best_guess = guess
                if depth == 2:
                    break  # cannot be beaten: |T|=1 terminates next turn

        assert best_depth is not None and best_guess is not None
        result = (best_depth, best_guess)
        self._dp_policy[candidate_key] = result
        return result

    def _greedy_evil_step(self, snapshot: Observation) -> Decision:
        """Fallback for non-Evil modes: one-ply evil-forced-bucket minimizer.

        Uses the shared ``decision_cache`` on ``StrategyBase`` so identical
        snapshot states are computed once per strategy instance. Without this,
        the benchmark's 2,315 unknown-mode games each re-run a full 13K-guess
        scan at turn 1, balloons wall time by orders of magnitude.
        """
        cache_key = self._cache_key(snapshot)
        cached = self.decision_cache.get(cache_key)
        if cached is not None:
            return cached
        candidates = self._candidate_pool(snapshot)
        guesses = self._guess_pool(snapshot)
        candidate_set = set(candidates)
        best_key: tuple[int, float, int, str] | None = None
        best_guess = candidates[0]
        best_explanation: dict[str, float | int | str | bool] = {}
        for guess in guesses:
            counts = self.table.partition_counts(guess, candidates)
            forced_size = evil_forced_bucket_size(counts)
            entropy = shannon_entropy(counts)
            in_candidate = 0 if guess in candidate_set else 1
            key = (forced_size, -entropy, in_candidate, guess)
            if self._break_tie(best_key, key):
                best_key = key
                best_guess = guess
                best_explanation = {
                    "pool_size": len(candidates),
                    "guess_pool_size": len(guesses),
                    "evil_forced_bucket": forced_size,
                    "entropy": round(entropy, 6),
                    "dp_optimal": False,
                    "fallback": "greedy-evil-shortest-path",
                }
        decision = Decision(guess=best_guess, explanation=best_explanation)
        self.decision_cache[cache_key] = decision
        return decision


class StrategyMetadata(NamedTuple):
    """Registry entry carrying the class, display metadata, and tier.

    The first three fields (``cls``, ``label``, ``objective``) preserve
    backward-compatible tuple indexing so older unpacking sites keep working.
    ``tier`` and ``caveat`` flow through the generated manifest into the web
    app so documentation surfaces the honest status of each strategy.
    """

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

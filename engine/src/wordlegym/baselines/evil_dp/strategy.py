from __future__ import annotations

from pathlib import Path

from ...decision import Decision
from ...metrics import PATTERN_EVIL_TIEBREAK, evil_forced_bucket_size, shannon_entropy
from ...observation import Observation
from ...strategy import StrategyBase
from .cache import cache_path, load_policy, save_policy

EVIL_DP_DEFAULT_BEAM = 100


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
        return cache_path(corpus_size=len(self.corpus.answers), beam=self._dp_beam)

    def _load_cache(self) -> bool:
        loaded = load_policy(self._cache_path())
        if loaded is None:
            return False
        self._dp_policy = loaded
        return True

    def _save_cache(self) -> None:
        save_policy(
            self._cache_path(),
            corpus_size=len(self.corpus.answers),
            beam=self._dp_beam,
            policy=self._dp_policy,
        )

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
                from ...feedback import score_guess as _score_guess
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

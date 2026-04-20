from __future__ import annotations

import math
import random
from collections import Counter
from dataclasses import dataclass, field

from .analysis import FeedbackTable
from .corpus import WordCorpus
from .hash_utils import decision_state_hash
from .metrics import expected_remaining, reduction_ratio, shannon_entropy, worst_case_bucket
from .models import GameSnapshot, StrategyDecision


@dataclass
class StrategyBase:
    corpus: WordCorpus
    table: FeedbackTable
    id: str
    label: str
    objective: str
    decision_cache: dict[tuple[object, ...], StrategyDecision] = field(default_factory=dict, init=False, repr=False)

    def choose_guess(self, snapshot: GameSnapshot) -> StrategyDecision:
        raise NotImplementedError

    def _candidate_pool(self, snapshot: GameSnapshot) -> tuple[str, ...]:
        if snapshot.mode == "unknown":
            standard = snapshot.standard_candidate_words or ()
            evil = snapshot.evil_candidate_words or ()
            combined = tuple(sorted(set(standard) | set(evil)))
            return combined or snapshot.candidate_words
        return snapshot.candidate_words

    def _guess_pool(self, snapshot: GameSnapshot) -> tuple[str, ...]:
        return self._candidate_pool(snapshot)

    def _break_tie(self, current: tuple | None, challenger: tuple) -> bool:
        return current is None or challenger < current

    def _cache_key(self, snapshot: GameSnapshot) -> tuple[object, ...]:
        if snapshot.mode == "unknown":
            posterior = snapshot.mode_posterior.to_dict() if snapshot.mode_posterior is not None else {"standard": 0.5, "evil": 0.5}
            return (
                snapshot.mode,
                snapshot.standard_candidate_words or (),
                snapshot.evil_candidate_words or (),
                round(posterior["standard"], 6),
                round(posterior["evil"], 6),
            )
        return (snapshot.mode, snapshot.candidate_words)


class RandomValidStrategy(StrategyBase):
    def choose_guess(self, snapshot: GameSnapshot) -> StrategyDecision:
        cache_key = self._cache_key(snapshot)
        if cache_key in self.decision_cache:
            return self.decision_cache[cache_key]
        pool = self._candidate_pool(snapshot)
        seed = int(decision_state_hash(snapshot)[:12], 16)
        decision = StrategyDecision(guess=random.Random(seed).choice(pool), explanation={"seed": seed, "pool_size": len(pool)})
        self.decision_cache[cache_key] = decision
        return decision


class LetterFrequencyStrategy(StrategyBase):
    def choose_guess(self, snapshot: GameSnapshot) -> StrategyDecision:
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
        decision = StrategyDecision(guess=best_guess, explanation=explanation)
        self.decision_cache[cache_key] = decision
        return decision


class PartitionStrategy(StrategyBase):
    metric_name = "entropy"

    def _guess_pool(self, snapshot: GameSnapshot) -> tuple[str, ...]:
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

    def choose_guess(self, snapshot: GameSnapshot) -> StrategyDecision:
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
        decision = StrategyDecision(guess=best_guess, explanation=best_explanation)
        self.decision_cache[cache_key] = decision
        return decision


class CandidateEliminationStrategy(PartitionStrategy):
    metric_name = "elimination"


class EntropyStrategy(PartitionStrategy):
    metric_name = "entropy"


class MinimaxStrategy(PartitionStrategy):
    metric_name = "minimax"


class AdaptiveRobustStrategy(StrategyBase):
    def _guess_pool(self, snapshot: GameSnapshot) -> tuple[str, ...]:
        return self.corpus.all_allowed

    def choose_guess(self, snapshot: GameSnapshot) -> StrategyDecision:
        cache_key = self._cache_key(snapshot)
        if cache_key in self.decision_cache:
            return self.decision_cache[cache_key]
        candidates = self._candidate_pool(snapshot)
        guesses = self._guess_pool(snapshot)
        candidate_set = set(candidates)
        standard_candidates = snapshot.standard_candidate_words or candidates
        evil_candidates = snapshot.evil_candidate_words or candidates
        if snapshot.mode_posterior is None:
            standard_weight = 1.0 if snapshot.mode == "standard" else 0.0
            evil_weight = 1.0 if snapshot.mode == "evil" else 0.5
        else:
            standard_weight = snapshot.mode_posterior.standard
            evil_weight = snapshot.mode_posterior.evil

        max_entropy = math.log2(len(standard_candidates)) if len(standard_candidates) > 1 else 1.0
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
        decision = StrategyDecision(guess=best_guess, explanation=best_explanation)
        self.decision_cache[cache_key] = decision
        return decision


STRATEGY_REGISTRY = {
    "random-valid": (RandomValidStrategy, "Random Valid", "Deterministic seeded random play over feasible answers."),
    "letter-frequency": (LetterFrequencyStrategy, "Letter Frequency", "Maximize weighted letter coverage over feasible answers."),
    "candidate-elimination": (
        CandidateEliminationStrategy,
        "Candidate Elimination",
        "Minimize expected remaining candidates.",
    ),
    "expected-entropy": (EntropyStrategy, "Expected Entropy", "Maximize expected information gain."),
    "minimax": (MinimaxStrategy, "Minimax", "Minimize worst-case remaining candidates."),
    "adaptive-robust": (
        AdaptiveRobustStrategy,
        "Adaptive Robust",
        "Blend standard-mode information gain with evil-mode worst-case protection.",
    ),
}


def build_strategies(corpus: WordCorpus) -> dict[str, StrategyBase]:
    table = FeedbackTable(corpus)
    return {
        strategy_id: cls(corpus=corpus, table=table, id=strategy_id, label=label, objective=objective)
        for strategy_id, (cls, label, objective) in STRATEGY_REGISTRY.items()
    }

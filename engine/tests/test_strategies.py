from __future__ import annotations

import unittest

from wordlegym.analysis import FeedbackTable
from wordlegym.corpus import WordCorpus
from wordlegym.environments import StandardEnvironment, GameConfig
from wordlegym.strategies import (
    AdaptiveRobustStrategy,
    CandidateEliminationStrategy,
    EntropyStrategy,
    LetterFrequencyStrategy,
    MinimaxStrategy,
    RandomValidStrategy,
    build_strategies,
)


class FullVocabSearchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.corpus = WordCorpus(
            answers=("cigar", "rebut", "sissy", "humph"),
            allowed_guesses=("aahed", "aalii", "cigar", "rebut", "sissy", "humph"),
        )
        self.table = FeedbackTable(self.corpus)

    def test_partition_strategy_searches_full_vocabulary(self) -> None:
        strategy = EntropyStrategy(
            corpus=self.corpus, table=self.table, id="test-entropy", label="Test", objective="Test",
        )
        env = StandardEnvironment(self.corpus)
        env.reset(GameConfig(hidden_answer="cigar"))
        snapshot = env.snapshot()
        decision = strategy.choose_guess(snapshot)
        self.assertIn(decision.guess, self.corpus.allowed_set)
        self.assertIn("guess_pool_size", decision.explanation)
        self.assertEqual(decision.explanation["guess_pool_size"], len(self.corpus.all_allowed))

    def test_partition_strategy_prefers_candidate_on_tie(self) -> None:
        corpus = WordCorpus(
            answers=("cigar", "rebut"),
            allowed_guesses=("cigar", "rebut"),
        )
        table = FeedbackTable(corpus)
        strategy = EntropyStrategy(
            corpus=corpus, table=table, id="test-entropy", label="Test", objective="Test",
        )
        env = StandardEnvironment(corpus)
        env.reset(GameConfig(hidden_answer="cigar"))
        snapshot = env.snapshot()
        decision = strategy.choose_guess(snapshot)
        self.assertIn(decision.guess, corpus.answer_set)

    def test_letter_frequency_only_searches_candidates(self) -> None:
        strategy = LetterFrequencyStrategy(
            corpus=self.corpus, table=self.table, id="test-lf", label="Test", objective="Test",
        )
        env = StandardEnvironment(self.corpus)
        env.reset(GameConfig(hidden_answer="cigar"))
        snapshot = env.snapshot()
        decision = strategy.choose_guess(snapshot)
        self.assertIn(decision.guess, set(self.corpus.answers))

    def test_random_only_searches_candidates(self) -> None:
        strategy = RandomValidStrategy(
            corpus=self.corpus, table=self.table, id="test-rand", label="Test", objective="Test",
        )
        env = StandardEnvironment(self.corpus)
        env.reset(GameConfig(hidden_answer="cigar"))
        snapshot = env.snapshot()
        decision = strategy.choose_guess(snapshot)
        self.assertIn(decision.guess, set(self.corpus.answers))

    def test_adaptive_robust_has_normalized_entropy(self) -> None:
        strategy = AdaptiveRobustStrategy(
            corpus=self.corpus, table=self.table, id="test-ar", label="Test", objective="Test",
        )
        env = StandardEnvironment(self.corpus)
        env.reset(GameConfig(hidden_answer="cigar"))
        snapshot = env.snapshot()
        decision = strategy.choose_guess(snapshot)
        self.assertIn("normalized_standard_entropy", decision.explanation)
        self.assertGreaterEqual(decision.explanation["normalized_standard_entropy"], 0.0)
        self.assertLessEqual(decision.explanation["normalized_standard_entropy"], 1.0)

    def test_minimax_searches_full_vocabulary(self) -> None:
        strategy = MinimaxStrategy(
            corpus=self.corpus, table=self.table, id="test-mm", label="Test", objective="Test",
        )
        env = StandardEnvironment(self.corpus)
        env.reset(GameConfig(hidden_answer="cigar"))
        snapshot = env.snapshot()
        decision = strategy.choose_guess(snapshot)
        self.assertIn(decision.guess, self.corpus.allowed_set)
        self.assertEqual(decision.explanation["guess_pool_size"], len(self.corpus.all_allowed))

    def test_candidate_elimination_searches_full_vocabulary(self) -> None:
        strategy = CandidateEliminationStrategy(
            corpus=self.corpus, table=self.table, id="test-ce", label="Test", objective="Test",
        )
        env = StandardEnvironment(self.corpus)
        env.reset(GameConfig(hidden_answer="cigar"))
        snapshot = env.snapshot()
        decision = strategy.choose_guess(snapshot)
        self.assertIn(decision.guess, self.corpus.allowed_set)
        self.assertEqual(decision.explanation["guess_pool_size"], len(self.corpus.all_allowed))


class FeedbackTableCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self.corpus = WordCorpus(
            answers=("cigar", "rebut", "sissy", "humph"),
            allowed_guesses=("aahed", "aalii", "cigar", "rebut", "sissy", "humph"),
        )
        self.table = FeedbackTable(self.corpus)

    def test_answer_row_uses_precomputed(self) -> None:
        counts = self.table.partition_counts("cigar", self.corpus.answers)
        self.assertIsInstance(counts, dict)
        self.assertGreater(len(counts), 0)

    def test_non_answer_row_is_cached(self) -> None:
        self.assertEqual(len(self.table._extra_row_cache), 0)
        self.table.partition_counts("aahed", self.corpus.answers)
        self.assertIn("aahed", self.table._extra_row_cache)
        cached_row = self.table._extra_row_cache["aahed"]
        self.table.partition_counts("aahed", self.corpus.answers)
        self.assertIs(self.table._extra_row_cache["aahed"], cached_row)

    def test_non_answer_and_answer_produce_same_partitions(self) -> None:
        counts_precomputed = self.table.partition_counts("cigar", self.corpus.answers)
        self.table.answer_rows  # force precompute
        row = self.table._get_row("cigar")
        self.assertIsNotNone(row)
        self.assertEqual(sum(counts_precomputed.values()), len(self.corpus.answers))


if __name__ == "__main__":
    unittest.main()

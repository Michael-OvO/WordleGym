from __future__ import annotations

import unittest

from wordlegym.analysis import FeedbackTable
from wordlegym.baselines import (
    CandidateEliminationStrategy,
    EntropyStrategy,
    EvilDPStrategy,
    EvilShortestPathStrategy,
    LetterFrequencyStrategy,
    MinimaxStrategy,
    PosteriorExpectimaxStrategy,
    PosteriorHybridStrategy,
    RandomValidStrategy,
    RobustScalarizationStrategy,
)
from wordlegym.corpus import WordCorpus
from wordlegym.environments import StandardEnvironment, GameConfig
from wordlegym.registry import build_strategies


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

    def test_posterior_hybrid_has_normalized_entropy(self) -> None:
        strategy = PosteriorHybridStrategy(
            corpus=self.corpus, table=self.table, id="test-ph", label="Test", objective="Test",
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

    def test_evil_shortest_path_reports_forced_bucket(self) -> None:
        strategy = EvilShortestPathStrategy(
            corpus=self.corpus, table=self.table, id="test-esp", label="Test", objective="Test",
        )
        env = StandardEnvironment(self.corpus)
        env.reset(GameConfig(hidden_answer="cigar"))
        snapshot = env.snapshot()
        decision = strategy.choose_guess(snapshot)
        self.assertIn(decision.guess, self.corpus.allowed_set)
        self.assertIn("evil_forced_bucket", decision.explanation)
        self.assertGreaterEqual(decision.explanation["evil_forced_bucket"], 1)
        self.assertLessEqual(decision.explanation["evil_forced_bucket"], len(self.corpus.answers))

    def test_posterior_expectimax_reduces_to_candidate_elimination_in_standard(self) -> None:
        ce = CandidateEliminationStrategy(
            corpus=self.corpus, table=self.table, id="ce", label="Test", objective="Test",
        )
        pe = PosteriorExpectimaxStrategy(
            corpus=self.corpus, table=self.table, id="pe", label="Test", objective="Test",
        )
        env = StandardEnvironment(self.corpus)
        env.reset(GameConfig(hidden_answer="cigar"))
        snapshot = env.snapshot()
        self.assertEqual(ce.choose_guess(snapshot).guess, pe.choose_guess(snapshot).guess)

    def test_evil_dp_solves_small_corpus_exactly(self) -> None:
        # Small corpus so exact DP is fast even without the disk cache.
        strategy = EvilDPStrategy(
            corpus=self.corpus, table=self.table, id="test-dp", label="Test", objective="Test",
        )
        # Force a disposable cache directory so the test doesn't pollute the repo.
        import os
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as tmp:
            os.environ["WORDLEGYM_EVIL_DP_CACHE_DIR"] = tmp
            try:
                from wordlegym.environments import EvilEnvironment
                env = EvilEnvironment(self.corpus)
                env.reset(GameConfig())
                snapshot = env.snapshot()
                decision = strategy.choose_guess(snapshot)
                self.assertIn(decision.guess, self.corpus.allowed_set)
                self.assertIn("dp_remaining_depth", decision.explanation)
                self.assertGreaterEqual(decision.explanation["dp_remaining_depth"], 1)
                # Playing the DP's chosen guess strictly reduces the candidate set.
                env.apply_guess(decision.guess)
                self.assertLess(len(env.candidate_words), len(self.corpus.answers))
            finally:
                os.environ.pop("WORDLEGYM_EVIL_DP_CACHE_DIR", None)

    def test_evil_dp_falls_back_for_standard_mode(self) -> None:
        strategy = EvilDPStrategy(
            corpus=self.corpus, table=self.table, id="test-dp", label="Test", objective="Test",
        )
        env = StandardEnvironment(self.corpus)
        env.reset(GameConfig(hidden_answer="cigar"))
        snapshot = env.snapshot()
        decision = strategy.choose_guess(snapshot)
        self.assertIn(decision.guess, self.corpus.allowed_set)
        self.assertEqual(decision.explanation.get("dp_optimal"), False)
        self.assertEqual(decision.explanation.get("fallback"), "greedy-evil-shortest-path")

    def test_robust_scalarization_reports_both_costs(self) -> None:
        strategy = RobustScalarizationStrategy(
            corpus=self.corpus, table=self.table, id="test-rs", label="Test", objective="Test",
        )
        env = StandardEnvironment(self.corpus)
        env.reset(GameConfig(hidden_answer="cigar"))
        snapshot = env.snapshot()
        decision = strategy.choose_guess(snapshot)
        self.assertIn(decision.guess, self.corpus.allowed_set)
        self.assertIn("standard_cost", decision.explanation)
        self.assertIn("evil_cost", decision.explanation)
        self.assertIn("robust_score", decision.explanation)
        robust = decision.explanation["robust_score"]
        self.assertGreaterEqual(robust, decision.explanation["standard_cost"])
        self.assertGreaterEqual(robust, decision.explanation["evil_cost"])


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

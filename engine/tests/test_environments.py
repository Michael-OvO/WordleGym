from __future__ import annotations

import unittest

from wordlegym.corpus import WordCorpus
from wordlegym.environments import EvilEnvironment, GameConfig, StandardEnvironment, UnknownEnvironment


class EnvironmentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.corpus = WordCorpus(
            answers=("cigar", "rebut", "sissy", "humph"),
            allowed_guesses=("aahed", "cigar", "rebut", "sissy", "humph"),
        )

    def test_standard_environment_filters_candidates(self) -> None:
        env = StandardEnvironment(self.corpus)
        env.reset(GameConfig(hidden_answer="rebut"))
        env.apply_guess("cigar")
        self.assertIn("rebut", env.snapshot().candidate_words)
        self.assertNotIn("cigar", env.snapshot().candidate_words)

    def test_evil_environment_keeps_largest_bucket(self) -> None:
        env = EvilEnvironment(self.corpus)
        env.reset(GameConfig())
        env.apply_guess("cigar")
        self.assertEqual(env.snapshot().candidate_words, ("humph",))

    def test_unknown_environment_tracks_posterior(self) -> None:
        env = UnknownEnvironment(self.corpus)
        env.reset(GameConfig(hidden_mode="evil", mode_prior=0.5, seed=2))
        env.apply_guess("cigar")
        snapshot = env.snapshot()
        self.assertIsNotNone(snapshot.mode_posterior)
        self.assertGreaterEqual(snapshot.mode_posterior.evil, 0.0)

    def test_unknown_candidate_words_is_union(self) -> None:
        env = UnknownEnvironment(self.corpus)
        env.reset(GameConfig(hidden_mode="standard", hidden_answer="rebut", mode_prior=0.5, seed=2))
        env.apply_guess("cigar")
        snapshot = env.snapshot()
        std = set(snapshot.standard_candidate_words or ())
        evil = set(snapshot.evil_candidate_words or ())
        expected_union = std | evil
        if expected_union:
            self.assertEqual(set(snapshot.candidate_words), expected_union)
        else:
            self.assertEqual(set(snapshot.candidate_words), std)

    def test_unknown_candidates_fallback_when_evil_inconsistent(self) -> None:
        env = UnknownEnvironment(self.corpus)
        env.reset(GameConfig(hidden_mode="standard", hidden_answer="rebut", mode_prior=0.5, seed=2))
        env.apply_guess("cigar")
        env.apply_guess("rebut")
        snapshot = env.snapshot()
        if not snapshot.evil_consistent:
            std = set(snapshot.standard_candidate_words or ())
            self.assertEqual(set(snapshot.candidate_words), std)


if __name__ == "__main__":
    unittest.main()

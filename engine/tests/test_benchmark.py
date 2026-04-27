from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from wordlegym.benchmark import BenchmarkRunner
from wordlegym.corpus import WordCorpus
from wordlegym.registry import build_strategies
from wordlegym.trace import GameTrace, GuessTraceStep


class BenchmarkSmokeTests(unittest.TestCase):
    def test_runner_writes_outputs(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        corpus = WordCorpus(
            answers=("cigar", "rebut", "sissy", "humph"),
            allowed_guesses=("aahed", "cigar", "rebut", "sissy", "humph"),
        )
        runner = BenchmarkRunner(repo_root, corpus=corpus, strategies=build_strategies(corpus))
        payload = runner.run()
        self.assertIn("manifest", payload)
        self.assertIn("summaries", payload)
        self.assertIn("standard", payload["summaries"])

    def test_posterior_accuracy_averages_present_branches_only(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        corpus = WordCorpus(
            answers=("cigar", "rebut"),
            allowed_guesses=("cigar", "rebut"),
        )
        runner = BenchmarkRunner(repo_root, corpus=corpus, strategies=build_strategies(corpus))
        step = GuessTraceStep(
            turn=3,
            guess="cigar",
            pattern=242,
            pattern_text="GGGGG",
            pattern_emoji="GGGGG",
            remaining_candidates=1,
            candidate_preview=("cigar",),
            explanation={},
            mode_posterior={"standard": 0.75, "evil": 0.25},
        )
        trace = GameTrace(
            mode="unknown",
            branch="unknown-standard",
            strategy_id="test",
            hidden_answer="cigar",
            hidden_mode="standard",
            turns=3,
            solved=True,
            exhausted=False,
            remaining_candidates=1,
            steps=(step,),
        )
        self.assertEqual(
            runner._posterior_accuracy([trace]),
            [{"turn": 3, "mean_true_mode_posterior": 0.75}],
        )


if __name__ == "__main__":
    unittest.main()

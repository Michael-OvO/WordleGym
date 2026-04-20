from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from wordlegym.benchmark import BenchmarkRunner
from wordlegym.corpus import WordCorpus
from wordlegym.strategies import build_strategies


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


if __name__ == "__main__":
    unittest.main()

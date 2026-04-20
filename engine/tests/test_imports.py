from __future__ import annotations

import unittest


class ObservationModuleTests(unittest.TestCase):
    def test_observation_module_exposes_renamed_types(self) -> None:
        from wordlegym.feedback import TileState  # canonical home
        from wordlegym.observation import ModePosterior, Observation
        from wordlegym.observation import TileState as ReExportedTileState
        self.assertIs(TileState, ReExportedTileState)
        self.assertIsNotNone(ModePosterior)
        self.assertIsNotNone(Observation)

    def test_observation_field_names(self) -> None:
        from wordlegym.observation import Observation
        field_names = {f.name for f in Observation.__dataclass_fields__.values()}
        for name in ("mode", "turn", "max_turns", "guesses", "feedbacks",
                     "candidates", "solved", "exhausted",
                     "standard_candidates", "evil_candidates",
                     "mode_posterior", "standard_consistent", "evil_consistent"):
            self.assertIn(name, field_names, f"missing field {name!r}")
        self.assertNotIn("candidate_words", field_names)
        self.assertNotIn("standard_candidate_words", field_names)
        self.assertNotIn("evil_candidate_words", field_names)


class DecisionModuleTests(unittest.TestCase):
    def test_decision_module_exposes_renamed_type(self) -> None:
        from wordlegym.decision import Decision  # noqa: F401

    def test_decision_field_names(self) -> None:
        from wordlegym.decision import Decision
        field_names = {f.name for f in Decision.__dataclass_fields__.values()}
        self.assertEqual(field_names, {"guess", "explanation"})


class TraceModuleTests(unittest.TestCase):
    def test_trace_module_exposes_types(self) -> None:
        from wordlegym.trace import GameTrace, GuessTraceStep  # noqa: F401


class PackageSurfaceTests(unittest.TestCase):
    def test_top_level_reexports(self) -> None:
        import wordlegym
        for name in (
            "BenchmarkRunner", "Decision", "EvilEnvironment", "GameConfig",
            "GameTrace", "GuessTraceStep", "ModePosterior", "Observation",
            "STRATEGY_REGISTRY", "StandardEnvironment", "StrategyBase",
            "TileState", "UnknownEnvironment", "WordCorpus", "build_strategies",
            "decode_pattern", "encode_pattern", "pattern_to_emoji",
            "pattern_to_text", "score_guess",
        ):
            self.assertTrue(hasattr(wordlegym, name), f"wordlegym missing {name!r}")


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest


class ObservationModuleTests(unittest.TestCase):
    def test_observation_module_exposes_renamed_types(self) -> None:
        from wordlegym.observation import ModePosterior, Observation, TileState  # noqa: F401

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


if __name__ == "__main__":
    unittest.main()

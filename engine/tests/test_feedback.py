from __future__ import annotations

import unittest

from wordlegym.feedback import decode_pattern, pattern_to_text, score_guess


class FeedbackTests(unittest.TestCase):
    def test_all_correct(self) -> None:
        pattern = score_guess("cigar", "cigar")
        self.assertEqual(pattern_to_text(pattern), "GGGGG")

    def test_repeated_letters(self) -> None:
        pattern = score_guess("array", "cairn")
        self.assertEqual(pattern_to_text(pattern), "YYBBB")

    def test_decode_round_trip(self) -> None:
        pattern = score_guess("sissy", "missy")
        decoded = decode_pattern(pattern)
        self.assertEqual(len(decoded), 5)
        self.assertEqual(pattern_to_text(pattern), "BGGGG")


if __name__ == "__main__":
    unittest.main()

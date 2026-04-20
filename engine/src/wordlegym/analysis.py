from __future__ import annotations

from functools import cached_property

from .corpus import WordCorpus
from .feedback import score_guess


class FeedbackTable:
    def __init__(self, corpus: WordCorpus) -> None:
        self.corpus = corpus
        self.answer_index = corpus.answer_index
        self._extra_row_cache: dict[str, bytes] = {}

    @cached_property
    def answer_rows(self) -> dict[str, bytes]:
        rows: dict[str, bytes] = {}
        for guess in self.corpus.answers:
            row = bytearray(len(self.corpus.answers))
            for index, answer in enumerate(self.corpus.answers):
                row[index] = score_guess(guess, answer)
            rows[guess] = bytes(row)
        return rows

    def _get_row(self, guess: str) -> bytes | None:
        row = self.answer_rows.get(guess)
        if row is not None:
            return row
        row = self._extra_row_cache.get(guess)
        if row is not None:
            return row
        if guess not in self.corpus.allowed_set:
            return None
        new_row = bytearray(len(self.corpus.answers))
        for index, answer in enumerate(self.corpus.answers):
            new_row[index] = score_guess(guess, answer)
        cached = bytes(new_row)
        self._extra_row_cache[guess] = cached
        return cached

    def partition_counts(self, guess: str, candidate_words: tuple[str, ...]) -> dict[int, int]:
        counts: dict[int, int] = {}
        row = self._get_row(guess)
        if row is not None:
            for candidate in candidate_words:
                pattern = row[self.answer_index[candidate]]
                counts[pattern] = counts.get(pattern, 0) + 1
            return counts

        for candidate in candidate_words:
            pattern = score_guess(guess, candidate)
            counts[pattern] = counts.get(pattern, 0) + 1
        return counts


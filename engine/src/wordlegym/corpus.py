from __future__ import annotations

from dataclasses import dataclass
from functools import cached_property
from pathlib import Path


def load_word_list(path: Path) -> tuple[str, ...]:
    words = tuple(line.strip().lower() for line in path.read_text().splitlines() if line.strip())
    if any(len(word) != 5 or not word.isalpha() for word in words):
        raise ValueError(f"Invalid word list: {path}")
    return words


@dataclass(frozen=True)
class WordCorpus:
    answers: tuple[str, ...]
    allowed_guesses: tuple[str, ...]

    @classmethod
    def from_repo_root(cls, repo_root: Path) -> "WordCorpus":
        data_dir = repo_root / "data"
        return cls(
            answers=load_word_list(data_dir / "wordle-answers.txt"),
            allowed_guesses=load_word_list(data_dir / "wordle-allowed-guesses.txt"),
        )

    @cached_property
    def all_allowed(self) -> tuple[str, ...]:
        extras = [word for word in self.allowed_guesses if word not in self.answer_set]
        return self.answers + tuple(extras)

    @cached_property
    def answer_set(self) -> set[str]:
        return set(self.answers)

    @cached_property
    def allowed_set(self) -> set[str]:
        return set(self.answers) | set(self.allowed_guesses)

    @cached_property
    def answer_index(self) -> dict[str, int]:
        return {word: index for index, word in enumerate(self.answers)}

    def validate_guess(self, guess: str) -> bool:
        return guess in self.allowed_set

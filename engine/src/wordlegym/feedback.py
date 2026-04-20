from __future__ import annotations

from collections import Counter

from .models import TileState

WORD_LENGTH = 5
ALL_CORRECT_PATTERN = 242


def encode_pattern(states: list[int] | tuple[int, ...]) -> int:
    value = 0
    for power, state in enumerate(states):
        value += int(state) * (3**power)
    return value


def decode_pattern(pattern: int) -> tuple[TileState, ...]:
    digits: list[TileState] = []
    remainder = pattern
    for _ in range(WORD_LENGTH):
        remainder, digit = divmod(remainder, 3)
        digits.append(TileState(digit))
    return tuple(digits)


def score_guess(guess: str, answer: str) -> int:
    guess = guess.lower()
    answer = answer.lower()
    if len(guess) != WORD_LENGTH or len(answer) != WORD_LENGTH:
        raise ValueError("Wordle guesses and answers must be five letters long.")

    result = [TileState.ABSENT] * WORD_LENGTH
    remaining = Counter(answer)

    for index, (guess_char, answer_char) in enumerate(zip(guess, answer)):
        if guess_char == answer_char:
            result[index] = TileState.CORRECT
            remaining[guess_char] -= 1

    for index, guess_char in enumerate(guess):
        if result[index] is TileState.CORRECT:
            continue
        if remaining[guess_char] > 0:
            result[index] = TileState.PRESENT
            remaining[guess_char] -= 1

    return encode_pattern(result)


def pattern_to_text(pattern: int, *, absent: str = "B", present: str = "Y", correct: str = "G") -> str:
    mapping = {
        TileState.ABSENT: absent,
        TileState.PRESENT: present,
        TileState.CORRECT: correct,
    }
    return "".join(mapping[digit] for digit in decode_pattern(pattern))


def pattern_to_emoji(pattern: int) -> str:
    mapping = {
        TileState.ABSENT: "⬛",
        TileState.PRESENT: "🟨",
        TileState.CORRECT: "🟩",
    }
    return "".join(mapping[digit] for digit in decode_pattern(pattern))


def pattern_counts(pattern: int) -> tuple[int, int]:
    decoded = decode_pattern(pattern)
    greens = sum(1 for tile in decoded if tile is TileState.CORRECT)
    yellows = sum(1 for tile in decoded if tile is TileState.PRESENT)
    return greens, yellows


def is_all_correct(pattern: int) -> bool:
    return pattern == ALL_CORRECT_PATTERN


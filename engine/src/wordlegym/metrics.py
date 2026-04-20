from __future__ import annotations

import math

from .feedback import decode_pattern, pattern_counts as feedback_pattern_counts


def shannon_entropy(counts: dict[int, int]) -> float:
    total = sum(counts.values())
    if total == 0:
        return 0.0
    entropy = 0.0
    for count in counts.values():
        probability = count / total
        entropy -= probability * math.log2(probability)
    return entropy


def expected_remaining(counts: dict[int, int]) -> float:
    total = sum(counts.values())
    if total == 0:
        return 0.0
    return sum(count * count for count in counts.values()) / total


def worst_case_bucket(counts: dict[int, int]) -> int:
    return max(counts.values(), default=0)


def reduction_ratio(total: int, worst_case: int) -> float:
    if total <= 0:
        return 0.0
    return 1.0 - (worst_case / total)


def _build_pattern_evil_tiebreak() -> tuple[tuple[int, int, tuple[int, ...]], ...]:
    """Precompute (greens, yellows, digits) per pattern.

    There are only ``3**5 = 243`` possible patterns. Computing the tie-break
    triplet once and indexing by pattern integer turns ``evil_forced_bucket_size``
    from O(patterns * decode-cost) into a constant-cost lookup per pattern.
    """
    table: list[tuple[int, int, tuple[int, ...]]] = []
    for pattern in range(243):
        greens, yellows = feedback_pattern_counts(pattern)
        digits = tuple(int(tile) for tile in decode_pattern(pattern))
        table.append((greens, yellows, digits))
    return tuple(table)


PATTERN_EVIL_TIEBREAK: tuple[tuple[int, int, tuple[int, ...]], ...] = _build_pattern_evil_tiebreak()


def evil_forced_bucket_size(counts: dict[int, int]) -> int:
    """Size of the bucket the benchmark's evil adversary would return.

    Evil tie-break order matches the ``EvilEnvironment`` policy exactly:
    (largest size, fewest greens, fewest yellows, lex-smallest pattern digits).
    This is |T(C, g)| from the spec -- the deterministic evil successor size.

    Uses ``PATTERN_EVIL_TIEBREAK`` so the hot loop is a tight comparison of
    four-tuple keys, without redundant pattern decoding.
    """
    if not counts:
        return 0
    best_key: tuple[int, int, int, tuple[int, ...]] | None = None
    best_size = 0
    for pattern, size in counts.items():
        greens, yellows, digits = PATTERN_EVIL_TIEBREAK[pattern]
        key = (-size, greens, yellows, digits)
        if best_key is None or key < best_key:
            best_key = key
            best_size = size
    return best_size


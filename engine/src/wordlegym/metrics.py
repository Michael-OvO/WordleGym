from __future__ import annotations

import math


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


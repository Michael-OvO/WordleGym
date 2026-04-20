from __future__ import annotations

import json
import os
from pathlib import Path

EVIL_DP_CACHE_ENV = "WORDLEGYM_EVIL_DP_CACHE_DIR"


def default_cache_dir() -> Path:
    """``results/cache/`` relative to the repo root (five parents up from this file)."""
    return Path(__file__).resolve().parents[5] / "results" / "cache"


def cache_path(corpus_size: int, beam: int) -> Path:
    override = os.environ.get(EVIL_DP_CACHE_ENV)
    base = Path(override) if override else default_cache_dir()
    return base / f"evil-dp-k{beam}-n{corpus_size}.json"


def load_policy(path: Path) -> dict[tuple[str, ...], tuple[int, str]] | None:
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (json.JSONDecodeError, OSError):
        return None
    if not isinstance(payload, dict) or "entries" not in payload:
        return None
    policy: dict[tuple[str, ...], tuple[int, str]] = {}
    for entry in payload["entries"]:
        words = tuple(entry["words"])
        policy[words] = (int(entry["depth"]), str(entry["guess"]))
    return policy


def save_policy(path: Path, corpus_size: int, beam: int, policy: dict[tuple[str, ...], tuple[int, str]]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "corpus_size": corpus_size,
            "beam": beam,
            "entries": [
                {"words": list(words), "depth": depth, "guess": guess}
                for words, (depth, guess) in policy.items()
            ],
        }
        with path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle)
    except OSError:
        # Caching is best-effort; a read-only filesystem should not break a run.
        pass

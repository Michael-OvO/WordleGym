from __future__ import annotations

import hashlib

from .observation import Observation


def decision_state_hash(snapshot: Observation) -> str:
    pieces = [
        snapshot.mode,
        ",".join(snapshot.guesses),
        ",".join(str(pattern) for pattern in snapshot.feedbacks),
        ",".join(snapshot.candidates),
    ]
    if snapshot.mode_posterior is not None:
        pieces.append(f"{snapshot.mode_posterior.standard:.6f}:{snapshot.mode_posterior.evil:.6f}")
    return hashlib.sha1("|".join(pieces).encode("utf-8")).hexdigest()

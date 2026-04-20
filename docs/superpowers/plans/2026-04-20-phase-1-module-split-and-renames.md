# WordleGym v1.0 — Phase 1: Module Split + Renames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the engine into the v1.0 module layout and rename the public domain types (`GameSnapshot → Observation`, `StrategyDecision → Decision`, `candidate_words → candidates`, etc.), with zero behavior change. The benchmark, environments, and strategies must produce byte-identical output before and after this plan.

**Architecture:** Mechanical refactor only. Each task is either a pure file move, a pure rename, or a small split. The existing test suite (in `engine/tests/`) is the regression harness — it must stay green throughout. New tests added in this plan exercise import surface only.

**Tech Stack:** Python 3.10+, stdlib `unittest`, `uv` for env management. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-04-20-public-gym-foundation-design.md](../specs/2026-04-20-public-gym-foundation-design.md), §3 Architecture overview, §4 Public API contract, §11 Migration sequence step 1.

**Out of scope (deferred to follow-on plans):**
- Plugin system / `@register` decorator (Phase 2)
- Step 5-tuple / reward (Phase 3)
- Artifact bundle (Phase 4)
- CLI rewrite (Phase 5)
- Web sync extraction (Phase 6)
- Gymnasium adapter (Phase 7)
- Packaging changes (Phase 8)

---

## File Structure

**New files (created in this plan):**
- `engine/src/wordlegym/observation.py` — `Observation` dataclass + `ModePosterior` (renamed from `GameSnapshot`)
- `engine/src/wordlegym/decision.py` — `Decision` dataclass (renamed from `StrategyDecision`)
- `engine/src/wordlegym/trace.py` — `GameTrace` and `GuessTraceStep` (moved from `models.py`, no rename)
- `engine/src/wordlegym/strategy.py` — `StrategyBase` ABC (moved from `strategies.py`, no rename in this plan)
- `engine/src/wordlegym/environments/__init__.py` — re-exports
- `engine/src/wordlegym/environments/base.py` — `BaseEnvironment`, `GameConfig`
- `engine/src/wordlegym/environments/standard.py` — `StandardEnvironment`
- `engine/src/wordlegym/environments/evil.py` — `EvilEnvironment`
- `engine/src/wordlegym/environments/unknown.py` — `UnknownEnvironment`
- `engine/src/wordlegym/baselines/__init__.py` — imports each baseline module so `STRATEGY_REGISTRY` populates on import
- `engine/src/wordlegym/baselines/random_valid.py` — `RandomValidStrategy`
- `engine/src/wordlegym/baselines/letter_frequency.py` — `LetterFrequencyStrategy`
- `engine/src/wordlegym/baselines/partition.py` — `PartitionStrategy`, `CandidateEliminationStrategy`, `EntropyStrategy`, `MinimaxStrategy`
- `engine/src/wordlegym/baselines/posterior_hybrid.py` — `PosteriorHybridStrategy`
- `engine/src/wordlegym/baselines/evil_shortest_path.py` — `EvilShortestPathStrategy`
- `engine/src/wordlegym/baselines/posterior_expectimax.py` — `PosteriorExpectimaxStrategy`
- `engine/src/wordlegym/baselines/robust_scalarization.py` — `RobustScalarizationStrategy`
- `engine/src/wordlegym/baselines/evil_dp/__init__.py` — re-exports `EvilDPStrategy`
- `engine/src/wordlegym/baselines/evil_dp/strategy.py` — `EvilDPStrategy` class + DP solver
- `engine/src/wordlegym/baselines/evil_dp/cache.py` — disk-cache load/save helpers
- `engine/src/wordlegym/registry.py` — bare-bones registry: `STRATEGY_REGISTRY`, `build_strategies` (becomes the real plugin system in Phase 2)
- `engine/tests/test_imports.py` — asserts the new public surface re-exports cleanly

**Deleted files:**
- `engine/src/wordlegym/models.py` — fully decomposed
- `engine/src/wordlegym/environments.py` — replaced by `environments/` package
- `engine/src/wordlegym/strategies.py` — replaced by `baselines/` package + `strategy.py` + `registry.py`

**Modified files (rename pass):**
- `engine/src/wordlegym/__init__.py` — new public re-exports
- `engine/src/wordlegym/feedback.py` — `TileState` definition moves here from `models.py`
- `engine/src/wordlegym/hash_utils.py` — uses `Observation` and renamed fields
- `engine/src/wordlegym/benchmark.py` — uses `Observation` and renamed fields
- `engine/src/wordlegym/cli.py` — no logic change; import path of `BenchmarkRunner` stays at `wordlegym.benchmark`
- `engine/tests/test_environments.py` — import path + field names
- `engine/tests/test_strategies.py` — import path + field names
- `engine/tests/test_benchmark.py` — import path

**Renames (applied across all consumers):**

| Old name | New name |
|---|---|
| `GameSnapshot` | `Observation` |
| `StrategyDecision` | `Decision` |
| `Observation.candidate_words` (was `GameSnapshot.candidate_words`) | `candidates` |
| `Observation.standard_candidate_words` | `standard_candidates` |
| `Observation.evil_candidate_words` | `evil_candidates` |
| `Strategy.choose_guess(snapshot)` | unchanged in this plan (renamed to `act` in Phase 2) |
| `BaseEnvironment.apply_guess(guess)` | unchanged in this plan (renamed to `step` in Phase 3) |
| `BaseEnvironment.snapshot()` | unchanged in this plan (renamed to `observe` in Phase 3) |

`GameTrace`, `GuessTraceStep`, `ModePosterior`, `TileState`, `WordCorpus`, `FeedbackTable`, `BenchmarkRunner`, and all strategy class names are unchanged in this plan.

---

## Working Directory

All commands run from the repo root (`/Users/michael/Documents/GitHub/WordleGym`) unless noted. The engine lives at `engine/` and uses `uv`. Tests run with:

```bash
cd engine && uv run python -m unittest discover -s tests
```

Throughout this plan, "run tests" means that command above; "smoke benchmark" means:

```bash
cd engine && uv run python -c "
from pathlib import Path
from wordlegym.benchmark import BenchmarkRunner
from wordlegym.corpus import WordCorpus
from wordlegym.registry import build_strategies
corpus = WordCorpus(answers=('cigar','rebut','sissy','humph'), allowed_guesses=('aahed','cigar','rebut','sissy','humph'))
runner = BenchmarkRunner(Path('..'), corpus=corpus, strategies=build_strategies(corpus))
out = runner.run()
print('strategies:', len(out['summaries']['standard']))
print('standard top:', out['summaries']['standard'][0]['strategy_id'], out['summaries']['standard'][0]['penalized_average_guesses'])
"
```

Expected: prints `strategies: 10` and a strategy id + a number. Same number must appear before and after the plan when re-run.

---

## Task 1: Establish baseline + capture golden output

**Files:**
- Create: `engine/tests/_baseline.txt` (gitignored after capture; only used in this plan)
- Run: existing `engine/tests/`

- [ ] **Step 1: Run the existing test suite to confirm green baseline**

```bash
cd engine && uv run python -m unittest discover -s tests
```

Expected output ends with `OK` and a non-zero test count (~22 tests across 4 files).

- [ ] **Step 2: Capture a golden snapshot of the toy-corpus benchmark**

```bash
cd engine && uv run python -c "
from pathlib import Path
import json
from wordlegym.benchmark import BenchmarkRunner
from wordlegym.corpus import WordCorpus
from wordlegym.strategies import build_strategies
corpus = WordCorpus(answers=('cigar','rebut','sissy','humph'), allowed_guesses=('aahed','cigar','rebut','sissy','humph'))
runner = BenchmarkRunner(Path('..'), corpus=corpus, strategies=build_strategies(corpus))
out = runner.run()
print(json.dumps({'summaries': out['summaries'], 'robustness': out['robustness']}, sort_keys=True, indent=2))
" > tests/_baseline.txt
```

Expected: `tests/_baseline.txt` contains a JSON dump of summaries + robustness for the toy corpus. This file is the regression target for Task 13.

- [ ] **Step 3: Verify the baseline file is well-formed**

```bash
cd engine && uv run python -c "import json; json.load(open('tests/_baseline.txt'))" && echo OK
```

Expected: prints `OK`. (No commit — this file is local scratch for the plan.)

---

## Task 2: Create new `observation.py` with renamed dataclasses

**Files:**
- Create: `engine/src/wordlegym/observation.py`
- Test: `engine/tests/test_imports.py`

- [ ] **Step 1: Write the import-surface test for the new module**

Create `engine/tests/test_imports.py`:

```python
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
```

- [ ] **Step 2: Run test to confirm it fails (module does not exist yet)**

```bash
cd engine && uv run python -m unittest tests.test_imports -v
```

Expected: `ImportError: No module named 'wordlegym.observation'`.

- [ ] **Step 3: Create `wordlegym/observation.py` with the renamed dataclasses**

```python
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import IntEnum
from typing import Any


class TileState(IntEnum):
    ABSENT = 0
    PRESENT = 1
    CORRECT = 2


@dataclass(frozen=True)
class ModePosterior:
    standard: float
    evil: float

    def to_dict(self) -> dict[str, float]:
        return {"standard": round(self.standard, 6), "evil": round(self.evil, 6)}


@dataclass(frozen=True)
class Observation:
    mode: str
    turn: int
    max_turns: int | None
    guesses: tuple[str, ...]
    feedbacks: tuple[int, ...]
    solved: bool
    exhausted: bool
    candidates: tuple[str, ...]
    standard_candidates: tuple[str, ...] | None = None
    evil_candidates: tuple[str, ...] | None = None
    mode_posterior: ModePosterior | None = None
    standard_consistent: bool = True
    evil_consistent: bool = False

    @property
    def remaining_candidates(self) -> int:
        return len(self.candidates)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        if self.mode_posterior is not None:
            payload["mode_posterior"] = self.mode_posterior.to_dict()
        return payload
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd engine && uv run python -m unittest tests.test_imports -v
```

Expected: 2 tests pass.

- [ ] **Step 5: Confirm no other tests broke**

```bash
cd engine && uv run python -m unittest discover -s tests
```

Expected: all tests still pass (existing tests still use `models.GameSnapshot`; we haven't switched any consumers yet).

- [ ] **Step 6: Commit**

```bash
git add engine/src/wordlegym/observation.py engine/tests/test_imports.py
git commit -m "feat(engine): add observation module with renamed Observation dataclass

Introduces wordlegym.observation as the new home for Observation
(renamed from GameSnapshot), ModePosterior, and TileState. Field
renames: candidate_words -> candidates, standard_candidate_words ->
standard_candidates, evil_candidate_words -> evil_candidates.

No consumers switched yet; models.GameSnapshot still works."
```

---

## Task 3: Create new `decision.py` with renamed dataclass

**Files:**
- Create: `engine/src/wordlegym/decision.py`
- Modify: `engine/tests/test_imports.py`

- [ ] **Step 1: Add a failing import test**

Append to `engine/tests/test_imports.py` (above the `if __name__` block):

```python
class DecisionModuleTests(unittest.TestCase):
    def test_decision_module_exposes_renamed_type(self) -> None:
        from wordlegym.decision import Decision  # noqa: F401

    def test_decision_field_names(self) -> None:
        from wordlegym.decision import Decision
        field_names = {f.name for f in Decision.__dataclass_fields__.values()}
        self.assertEqual(field_names, {"guess", "explanation"})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd engine && uv run python -m unittest tests.test_imports.DecisionModuleTests -v
```

Expected: `ImportError: No module named 'wordlegym.decision'`.

- [ ] **Step 3: Create `wordlegym/decision.py`**

```python
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping


@dataclass(frozen=True)
class Decision:
    guess: str
    explanation: Mapping[str, Any] = field(default_factory=dict)
```

- [ ] **Step 4: Run tests to confirm green**

```bash
cd engine && uv run python -m unittest discover -s tests
```

Expected: all tests pass; new `DecisionModuleTests` passes.

- [ ] **Step 5: Commit**

```bash
git add engine/src/wordlegym/decision.py engine/tests/test_imports.py
git commit -m "feat(engine): add decision module with renamed Decision dataclass

StrategyDecision -> Decision. Lives in wordlegym.decision.
Old name still works via models.StrategyDecision; consumers
will switch in a later task."
```

---

## Task 4: Create new `trace.py` (move only, no rename)

**Files:**
- Create: `engine/src/wordlegym/trace.py`
- Modify: `engine/tests/test_imports.py`

- [ ] **Step 1: Add a failing import test**

Append to `engine/tests/test_imports.py` (above the `if __name__` block):

```python
class TraceModuleTests(unittest.TestCase):
    def test_trace_module_exposes_types(self) -> None:
        from wordlegym.trace import GameTrace, GuessTraceStep  # noqa: F401
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd engine && uv run python -m unittest tests.test_imports.TraceModuleTests -v
```

Expected: `ImportError`.

- [ ] **Step 3: Create `wordlegym/trace.py` (verbatim from models.py, no rename)**

```python
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class GuessTraceStep:
    turn: int
    guess: str
    pattern: int
    pattern_text: str
    pattern_emoji: str
    remaining_candidates: int
    candidate_preview: tuple[str, ...]
    explanation: dict[str, Any]
    mode_posterior: dict[str, float] | None = None
    standard_candidates: int | None = None
    evil_candidates: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class GameTrace:
    mode: str
    branch: str
    strategy_id: str
    hidden_answer: str | None
    hidden_mode: str | None
    turns: int
    solved: bool
    exhausted: bool
    remaining_candidates: int
    steps: tuple[GuessTraceStep, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "branch": self.branch,
            "strategy_id": self.strategy_id,
            "hidden_answer": self.hidden_answer,
            "hidden_mode": self.hidden_mode,
            "turns": self.turns,
            "solved": self.solved,
            "exhausted": self.exhausted,
            "remaining_candidates": self.remaining_candidates,
            "steps": [step.to_dict() for step in self.steps],
        }
```

- [ ] **Step 4: Run tests to confirm green**

```bash
cd engine && uv run python -m unittest discover -s tests
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add engine/src/wordlegym/trace.py engine/tests/test_imports.py
git commit -m "feat(engine): extract GameTrace/GuessTraceStep into trace module

Pure move from models.py with no rename. models.GameTrace is
still the canonical reference for current consumers; the move
to wordlegym.trace lets us delete models.py once consumers
switch."
```

---

## Task 5: Move `TileState` into `feedback.py`; delete the import shim

**Files:**
- Modify: `engine/src/wordlegym/feedback.py`
- Modify: `engine/src/wordlegym/__init__.py` (no change needed yet — `__init__` imports from `feedback`, not `models`)

`TileState` is currently defined in `models.py` and imported by `feedback.py` plus the new `observation.py`. After this task, `feedback.py` owns the definition and `observation.py` re-imports it from `feedback`.

- [ ] **Step 1: Update `feedback.py` to define `TileState` locally**

Replace the top of `engine/src/wordlegym/feedback.py`:

```python
from __future__ import annotations

from collections import Counter
from enum import IntEnum


class TileState(IntEnum):
    ABSENT = 0
    PRESENT = 1
    CORRECT = 2


WORD_LENGTH = 5
ALL_CORRECT_PATTERN = 242
```

(Delete the line `from .models import TileState` and the previous standalone `WORD_LENGTH` / `ALL_CORRECT_PATTERN` lines if duplicated.)

- [ ] **Step 2: Update `observation.py` to re-import `TileState` from `feedback`**

Edit `engine/src/wordlegym/observation.py` — replace the top imports:

```python
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from .feedback import TileState
```

…and delete the local `TileState` class definition (it now lives in `feedback`). `Observation`, `ModePosterior` stay.

- [ ] **Step 3: Update `models.py` to re-import `TileState` from `feedback`**

Until consumers stop using `wordlegym.models`, `models.TileState` must keep working. Edit `engine/src/wordlegym/models.py` and replace its `TileState` class with:

```python
from .feedback import TileState  # re-export for backward-compat within this plan
```

(Keep the rest of `models.py` for now.)

- [ ] **Step 4: Update the import test to assert TileState lives in feedback**

Edit the `ObservationModuleTests` class in `engine/tests/test_imports.py` so the first test reads:

```python
    def test_observation_module_exposes_renamed_types(self) -> None:
        from wordlegym.feedback import TileState  # canonical home
        from wordlegym.observation import ModePosterior, Observation
        from wordlegym.observation import TileState as ReExportedTileState
        self.assertIs(TileState, ReExportedTileState)
```

- [ ] **Step 5: Run all tests**

```bash
cd engine && uv run python -m unittest discover -s tests
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add engine/src/wordlegym/feedback.py engine/src/wordlegym/observation.py \
        engine/src/wordlegym/models.py engine/tests/test_imports.py
git commit -m "refactor(engine): TileState canonical home is feedback.py

feedback.py owns TileState; observation.py re-imports it.
models.py keeps a shim until consumers switch."
```

---

## Task 6: Switch `hash_utils.py` to `Observation`

**Files:**
- Modify: `engine/src/wordlegym/hash_utils.py`

- [ ] **Step 1: Rewrite `hash_utils.py` to use `Observation` + new field names**

Replace the file contents:

```python
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
```

- [ ] **Step 2: Do not commit yet — move directly to Task 7**

`hash_utils` now expects `Observation` with `.candidates`, but the environments still return the old `GameSnapshot` with `.candidate_words`, so any test that runs `RandomValidStrategy.choose_guess` (e.g., `test_strategies.py::test_random_only_searches_candidates`) will fail with `AttributeError`. This is the expected mid-refactor state.

Tasks 6 → 7 → 8 → 9 form one atomic rename across the consumer graph; the test suite only goes green again at the end of Task 9, where everything is committed in one commit.

Do not run tests now. Proceed to Task 7.

---

## Task 7: Switch `environments.py` to emit `Observation` with renamed fields

**Files:**
- Modify: `engine/src/wordlegym/environments.py`

This is the largest single edit in the plan. The file gets rewritten end-to-end. After this task, `BaseEnvironment.snapshot()` returns an `Observation` with the new field names; consumers (`strategies.py`, `benchmark.py`, `hash_utils.py`) must follow in Tasks 8 and 9.

- [ ] **Step 1: Rewrite `engine/src/wordlegym/environments.py`**

Replace the file contents with:

```python
from __future__ import annotations

import random
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass

from .corpus import WordCorpus
from .feedback import is_all_correct, pattern_counts, pattern_to_text, score_guess
from .observation import ModePosterior, Observation


@dataclass
class GameConfig:
    hidden_answer: str | None = None
    hidden_mode: str | None = None
    max_turns: int | None = None
    mode_prior: float = 0.5
    seed: int = 7


class BaseEnvironment(ABC):
    mode: str

    def __init__(self, corpus: WordCorpus) -> None:
        self.corpus = corpus
        self.max_turns: int | None = None
        self.guesses: list[str] = []
        self.feedbacks: list[int] = []
        self.candidate_words: tuple[str, ...] = corpus.answers
        self.solved = False

    @abstractmethod
    def reset(self, config: GameConfig) -> None:
        raise NotImplementedError

    @abstractmethod
    def apply_guess(self, guess: str) -> int:
        raise NotImplementedError

    def is_terminal(self) -> bool:
        return self.solved or self.is_exhausted()

    def is_exhausted(self) -> bool:
        return self.max_turns is not None and len(self.guesses) >= self.max_turns and not self.solved

    def snapshot(self) -> Observation:
        return Observation(
            mode=self.mode,
            turn=len(self.guesses),
            max_turns=self.max_turns,
            guesses=tuple(self.guesses),
            feedbacks=tuple(self.feedbacks),
            solved=self.solved,
            exhausted=self.is_exhausted(),
            candidates=self.candidate_words,
        )

    def _validate_guess(self, guess: str) -> str:
        normalized = guess.lower()
        if not self.corpus.validate_guess(normalized):
            raise ValueError(f"Invalid guess: {guess}")
        if self.is_terminal():
            raise ValueError("Game is already terminal.")
        return normalized


class StandardEnvironment(BaseEnvironment):
    mode = "standard"

    def __init__(self, corpus: WordCorpus) -> None:
        super().__init__(corpus)
        self.hidden_answer = corpus.answers[0]

    def reset(self, config: GameConfig) -> None:
        self.hidden_answer = config.hidden_answer or self.corpus.answers[0]
        self.max_turns = config.max_turns
        self.guesses = []
        self.feedbacks = []
        self.candidate_words = self.corpus.answers
        self.solved = False

    def apply_guess(self, guess: str) -> int:
        normalized = self._validate_guess(guess)
        pattern = score_guess(normalized, self.hidden_answer)
        self.guesses.append(normalized)
        self.feedbacks.append(pattern)
        self.candidate_words = tuple(
            candidate for candidate in self.candidate_words if score_guess(normalized, candidate) == pattern
        )
        self.solved = is_all_correct(pattern)
        return pattern


class EvilEnvironment(BaseEnvironment):
    mode = "evil"

    def reset(self, config: GameConfig) -> None:
        self.max_turns = config.max_turns
        self.guesses = []
        self.feedbacks = []
        self.candidate_words = self.corpus.answers
        self.solved = False

    def apply_guess(self, guess: str) -> int:
        normalized = self._validate_guess(guess)
        buckets: dict[int, list[str]] = defaultdict(list)
        for candidate in self.candidate_words:
            buckets[score_guess(normalized, candidate)].append(candidate)

        def bucket_key(item: tuple[int, list[str]]) -> tuple[int, int, int, tuple[int, ...]]:
            pattern, words = item
            greens, yellows = pattern_counts(pattern)
            digits = tuple(int(value) for value in pattern_to_text(pattern, absent="0", present="1", correct="2"))
            return (-len(words), greens, yellows, digits)

        pattern, survivors = min(buckets.items(), key=bucket_key)
        self.guesses.append(normalized)
        self.feedbacks.append(pattern)
        self.candidate_words = tuple(sorted(survivors))
        self.solved = is_all_correct(pattern) and len(self.candidate_words) == 1
        return pattern


class UnknownEnvironment(BaseEnvironment):
    mode = "unknown"

    def __init__(self, corpus: WordCorpus) -> None:
        super().__init__(corpus)
        self.standard_env = StandardEnvironment(corpus)
        self.evil_env = EvilEnvironment(corpus)
        self.hidden_mode = "standard"
        self.mode_prior = 0.5
        self.random = random.Random(7)
        self.standard_consistent = True
        self.evil_consistent = True
        self.standard_candidate_words = corpus.answers
        self.evil_candidate_words = corpus.answers

    def reset(self, config: GameConfig) -> None:
        self.max_turns = config.max_turns
        self.mode_prior = config.mode_prior
        self.random = random.Random(config.seed)
        self.hidden_mode = config.hidden_mode or ("evil" if self.random.random() < config.mode_prior else "standard")
        self.standard_env.reset(GameConfig(hidden_answer=config.hidden_answer, max_turns=config.max_turns))
        self.evil_env.reset(GameConfig(max_turns=config.max_turns))
        self.guesses = []
        self.feedbacks = []
        self.candidate_words = self.corpus.answers
        self.standard_candidate_words = self.corpus.answers
        self.evil_candidate_words = self.corpus.answers
        self.standard_consistent = True
        self.evil_consistent = True
        self.solved = False

    def apply_guess(self, guess: str) -> int:
        normalized = self._validate_guess(guess)
        if self.hidden_mode == "standard":
            pattern = self.standard_env.apply_guess(normalized)
        else:
            pattern = self.evil_env.apply_guess(normalized)

        self.guesses.append(normalized)
        self.feedbacks.append(pattern)
        self.standard_candidate_words = tuple(
            candidate
            for candidate in self.standard_candidate_words
            if score_guess(normalized, candidate) == pattern
        )
        self.standard_consistent = bool(self.standard_candidate_words)

        if not self.evil_consistent:
            self.evil_candidate_words = ()
        else:
            expected_evil_pattern = self._evil_expected_pattern(self.guesses[:-1], self.feedbacks[:-1], normalized)
            if expected_evil_pattern != pattern:
                self.evil_consistent = False
                self.evil_candidate_words = ()
            else:
                self.evil_candidate_words = tuple(
                    candidate for candidate in self.evil_candidate_words if score_guess(normalized, candidate) == pattern
                )
                self.evil_consistent = bool(self.evil_candidate_words)

        combined = set(self.standard_candidate_words) | set(self.evil_candidate_words)
        self.candidate_words = tuple(sorted(combined or set(self.standard_candidate_words)))
        self.solved = self.standard_env.solved if self.hidden_mode == "standard" else self.evil_env.solved
        return pattern

    def snapshot(self) -> Observation:
        posterior = self._mode_posterior()
        return Observation(
            mode=self.mode,
            turn=len(self.guesses),
            max_turns=self.max_turns,
            guesses=tuple(self.guesses),
            feedbacks=tuple(self.feedbacks),
            solved=self.solved,
            exhausted=self.is_exhausted(),
            candidates=self.candidate_words,
            standard_candidates=self.standard_candidate_words,
            evil_candidates=self.evil_candidate_words,
            mode_posterior=posterior,
            standard_consistent=self.standard_consistent,
            evil_consistent=self.evil_consistent,
        )

    def _mode_posterior(self) -> ModePosterior:
        initial_count = len(self.corpus.answers)
        standard_likelihood = len(self.standard_candidate_words) / initial_count if self.standard_consistent else 0.0
        evil_likelihood = 1.0 if self.evil_consistent else 0.0
        unnormalized_standard = (1.0 - self.mode_prior) * standard_likelihood
        unnormalized_evil = self.mode_prior * evil_likelihood
        total = unnormalized_standard + unnormalized_evil
        if total == 0:
            return ModePosterior(standard=0.5, evil=0.5)
        return ModePosterior(
            standard=unnormalized_standard / total,
            evil=unnormalized_evil / total,
        )

    def _evil_expected_pattern(
        self, prior_guesses: list[str], prior_feedbacks: list[int], next_guess: str
    ) -> int:
        candidates = self.corpus.answers
        for guess, pattern in zip(prior_guesses, prior_feedbacks):
            candidates = tuple(candidate for candidate in candidates if score_guess(guess, candidate) == pattern)

        buckets: dict[int, list[str]] = defaultdict(list)
        for candidate in candidates:
            buckets[score_guess(next_guess, candidate)].append(candidate)

        def bucket_key(item: tuple[int, list[str]]) -> tuple[int, int, int, tuple[int, ...]]:
            pattern, words = item
            greens, yellows = pattern_counts(pattern)
            digits = tuple(int(value) for value in pattern_to_text(pattern, absent="0", present="1", correct="2"))
            return (-len(words), greens, yellows, digits)

        return min(buckets.items(), key=bucket_key)[0]
```

The only differences from the previous version:
- `from .models import GameSnapshot, ModePosterior` → `from .observation import ModePosterior, Observation`
- All `GameSnapshot(...)` constructions → `Observation(...)` with `candidate_words=...` → `candidates=...`, `standard_candidate_words=...` → `standard_candidates=...`, `evil_candidate_words=...` → `evil_candidates=...`
- All return type annotations `GameSnapshot` → `Observation`

The internal attribute names (`self.candidate_words`, `self.standard_candidate_words`, `self.evil_candidate_words`) stay — those are private state, not the public API.

- [ ] **Step 2: Update `engine/tests/test_environments.py` to use new field names**

Replace the file contents with:

```python
from __future__ import annotations

import unittest

from wordlegym.corpus import WordCorpus
from wordlegym.environments import EvilEnvironment, GameConfig, StandardEnvironment, UnknownEnvironment


class EnvironmentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.corpus = WordCorpus(
            answers=("cigar", "rebut", "sissy", "humph"),
            allowed_guesses=("aahed", "cigar", "rebut", "sissy", "humph"),
        )

    def test_standard_environment_filters_candidates(self) -> None:
        env = StandardEnvironment(self.corpus)
        env.reset(GameConfig(hidden_answer="rebut"))
        env.apply_guess("cigar")
        self.assertIn("rebut", env.snapshot().candidates)
        self.assertNotIn("cigar", env.snapshot().candidates)

    def test_evil_environment_keeps_largest_bucket(self) -> None:
        env = EvilEnvironment(self.corpus)
        env.reset(GameConfig())
        env.apply_guess("cigar")
        self.assertEqual(env.snapshot().candidates, ("humph",))

    def test_unknown_environment_tracks_posterior(self) -> None:
        env = UnknownEnvironment(self.corpus)
        env.reset(GameConfig(hidden_mode="evil", mode_prior=0.5, seed=2))
        env.apply_guess("cigar")
        snapshot = env.snapshot()
        self.assertIsNotNone(snapshot.mode_posterior)
        self.assertGreaterEqual(snapshot.mode_posterior.evil, 0.0)

    def test_unknown_candidates_is_union(self) -> None:
        env = UnknownEnvironment(self.corpus)
        env.reset(GameConfig(hidden_mode="standard", hidden_answer="rebut", mode_prior=0.5, seed=2))
        env.apply_guess("cigar")
        snapshot = env.snapshot()
        std = set(snapshot.standard_candidates or ())
        evil = set(snapshot.evil_candidates or ())
        expected_union = std | evil
        if expected_union:
            self.assertEqual(set(snapshot.candidates), expected_union)
        else:
            self.assertEqual(set(snapshot.candidates), std)

    def test_unknown_candidates_fallback_when_evil_inconsistent(self) -> None:
        env = UnknownEnvironment(self.corpus)
        env.reset(GameConfig(hidden_mode="standard", hidden_answer="rebut", mode_prior=0.5, seed=2))
        env.apply_guess("cigar")
        env.apply_guess("rebut")
        snapshot = env.snapshot()
        if not snapshot.evil_consistent:
            std = set(snapshot.standard_candidates or ())
            self.assertEqual(set(snapshot.candidates), std)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run env tests; expect all to pass**

```bash
cd engine && uv run python -m unittest tests.test_environments -v
```

Expected: 5 tests pass.

- [ ] **Step 4: Run the full suite; expect strategies + benchmark to fail**

```bash
cd engine && uv run python -m unittest discover -s tests
```

Expected: `test_strategies` and `test_benchmark` fail with `AttributeError: 'Observation' object has no attribute 'candidate_words'` (and similar). This is intentional — those consumers are fixed in Tasks 8 and 9. Do **not** commit yet; the working tree is in a transitional state.

(If you need to pause work, this is a rare case where it is OK to commit a temporarily-red working tree to a feature branch — but prefer to keep working through Task 9 in one sitting.)

---

## Task 8: Switch `strategies.py` to `Observation`/`Decision` + new fields

**Files:**
- Modify: `engine/src/wordlegym/strategies.py`

This is a global find-and-replace across the file plus an import switch.

- [ ] **Step 1: Update the imports at the top of `strategies.py`**

Find:

```python
from .models import GameSnapshot, StrategyDecision
```

Replace with:

```python
from .observation import Observation
from .decision import Decision
```

- [ ] **Step 2: Rename type references throughout `strategies.py`**

Apply these textual replacements (all occurrences, file-wide):

| Find | Replace |
|---|---|
| `GameSnapshot` | `Observation` |
| `StrategyDecision` | `Decision` |
| `snapshot.candidate_words` | `snapshot.candidates` |
| `snapshot.standard_candidate_words` | `snapshot.standard_candidates` |
| `snapshot.evil_candidate_words` | `snapshot.evil_candidates` |

The `_cache_key` method also needs its tuple-element names updated; the new version reads:

```python
    def _cache_key(self, snapshot: Observation) -> tuple[object, ...]:
        if snapshot.mode == "unknown":
            posterior = snapshot.mode_posterior.to_dict() if snapshot.mode_posterior is not None else {"standard": 0.5, "evil": 0.5}
            return (
                snapshot.mode,
                snapshot.standard_candidates or (),
                snapshot.evil_candidates or (),
                round(posterior["standard"], 6),
                round(posterior["evil"], 6),
            )
        return (snapshot.mode, snapshot.candidates)
```

- [ ] **Step 3: Run strategy tests**

```bash
cd engine && uv run python -m unittest tests.test_strategies -v
```

Expected: all 12 strategy tests pass. (Test asserts only inspect `decision.guess` and `decision.explanation`, not `snapshot.candidate_words`, so once strategies consume `Observation` correctly the tests are green.)

- [ ] **Step 4: Run the full suite — only `test_benchmark` should still fail**

```bash
cd engine && uv run python -m unittest discover -s tests
```

Expected: `test_imports`, `test_environments`, `test_feedback`, `test_strategies` all pass. `test_benchmark.test_runner_writes_outputs` still fails because `BenchmarkRunner` references the old field names — that's Task 9.

If any `test_strategies` test fails with an `AttributeError` on `candidate_words` / `standard_candidate_words` / `evil_candidate_words`, a rename was missed in Step 2 — re-grep `strategies.py` and fix. Do not commit until Task 9 also passes; the commit at the end of Task 9 covers Tasks 6 through 9 atomically.

---

## Task 9: Switch `benchmark.py` to `Observation`/`Decision`/new fields + commit Tasks 7-9 together

**Files:**
- Modify: `engine/src/wordlegym/benchmark.py`

- [ ] **Step 1: Update imports**

Find:

```python
from .models import GameTrace, GuessTraceStep
```

Replace with:

```python
from .trace import GameTrace, GuessTraceStep
```

- [ ] **Step 2: Rename field references in `_play_game`**

Find this block in `benchmark.py` (~lines 165-173):

```python
            steps.append(
                GuessTraceStep(
                    turn=len(env.guesses),
                    guess=decision.guess,
                    pattern=pattern,
                    pattern_text=pattern_to_text(pattern),
                    pattern_emoji=pattern_to_emoji(pattern),
                    remaining_candidates=len(updated_snapshot.candidate_words),
                    candidate_preview=updated_snapshot.candidate_words[:8],
                    explanation=decision.explanation,
                    mode_posterior=mode_posterior,
                    standard_candidates=(
                        len(updated_snapshot.standard_candidate_words or ()) if updated_snapshot.standard_candidate_words else None
                    ),
                    evil_candidates=len(updated_snapshot.evil_candidate_words or ()) if updated_snapshot.evil_candidate_words else None,
                )
            )
```

Replace with:

```python
            steps.append(
                GuessTraceStep(
                    turn=len(env.guesses),
                    guess=decision.guess,
                    pattern=pattern,
                    pattern_text=pattern_to_text(pattern),
                    pattern_emoji=pattern_to_emoji(pattern),
                    remaining_candidates=len(updated_snapshot.candidates),
                    candidate_preview=updated_snapshot.candidates[:8],
                    explanation=decision.explanation,
                    mode_posterior=mode_posterior,
                    standard_candidates=(
                        len(updated_snapshot.standard_candidates or ()) if updated_snapshot.standard_candidates else None
                    ),
                    evil_candidates=len(updated_snapshot.evil_candidates or ()) if updated_snapshot.evil_candidates else None,
                )
            )
```

Also update the `snapshot.candidate_words` reference at line 185 (the post-loop `remaining_candidates=len(snapshot.candidate_words)`):

```python
            remaining_candidates=len(snapshot.candidates),
```

- [ ] **Step 3: Run all tests**

```bash
cd engine && uv run python -m unittest discover -s tests
```

Expected: all tests pass. (~22 tests across 5 files including `test_imports`.)

- [ ] **Step 4: Re-run the smoke benchmark and diff against the baseline**

```bash
cd engine && uv run python -c "
from pathlib import Path
import json
from wordlegym.benchmark import BenchmarkRunner
from wordlegym.corpus import WordCorpus
from wordlegym.strategies import build_strategies
corpus = WordCorpus(answers=('cigar','rebut','sissy','humph'), allowed_guesses=('aahed','cigar','rebut','sissy','humph'))
runner = BenchmarkRunner(Path('..'), corpus=corpus, strategies=build_strategies(corpus))
out = runner.run()
print(json.dumps({'summaries': out['summaries'], 'robustness': out['robustness']}, sort_keys=True, indent=2))
" > tests/_after_renames.txt

diff tests/_baseline.txt tests/_after_renames.txt && echo IDENTICAL
```

Expected: prints `IDENTICAL`. If the diff is non-empty, a rename was incomplete somewhere — search for `candidate_words`, `standard_candidate_words`, `evil_candidate_words`, `GameSnapshot`, `StrategyDecision` and fix.

- [ ] **Step 5: Commit Tasks 6 + 7 + 8 + 9 together**

```bash
git add engine/src/wordlegym/hash_utils.py engine/src/wordlegym/environments.py \
        engine/src/wordlegym/strategies.py engine/src/wordlegym/benchmark.py \
        engine/tests/test_environments.py
git commit -m "refactor(engine): rename GameSnapshot/StrategyDecision to Observation/Decision

All consumers (environments, strategies, benchmark, hash_utils, tests)
switched to the new types and new field names:
  candidate_words -> candidates
  standard_candidate_words -> standard_candidates
  evil_candidate_words -> evil_candidates

Toy-corpus benchmark output is byte-identical before and after."
```

---

## Task 10: Delete `models.py`

**Files:**
- Delete: `engine/src/wordlegym/models.py`

- [ ] **Step 1: Confirm nothing imports from `models`**

```bash
cd engine && uv run python -c "
import subprocess
result = subprocess.run(['grep', '-rn', '--include=*.py', 'from .models\\|from wordlegym.models\\|wordlegym.models', 'src', 'tests'], capture_output=True, text=True)
print(result.stdout)
print('---')
print('OK' if not result.stdout.strip() else 'STILL IMPORTED')
"
```

Expected: prints `OK`.

- [ ] **Step 2: Delete the file**

```bash
git rm engine/src/wordlegym/models.py
```

- [ ] **Step 3: Run all tests**

```bash
cd engine && uv run python -m unittest discover -s tests
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(engine): delete models.py — fully decomposed into observation/decision/trace"
```

---

## Task 11: Split `environments.py` into `environments/` package

**Files:**
- Create: `engine/src/wordlegym/environments/__init__.py`
- Create: `engine/src/wordlegym/environments/base.py`
- Create: `engine/src/wordlegym/environments/standard.py`
- Create: `engine/src/wordlegym/environments/evil.py`
- Create: `engine/src/wordlegym/environments/unknown.py`
- Delete: `engine/src/wordlegym/environments.py`

- [ ] **Step 1: Create `engine/src/wordlegym/environments/base.py`**

```python
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from ..corpus import WordCorpus
from ..observation import Observation


@dataclass
class GameConfig:
    hidden_answer: str | None = None
    hidden_mode: str | None = None
    max_turns: int | None = None
    mode_prior: float = 0.5
    seed: int = 7


class BaseEnvironment(ABC):
    mode: str

    def __init__(self, corpus: WordCorpus) -> None:
        self.corpus = corpus
        self.max_turns: int | None = None
        self.guesses: list[str] = []
        self.feedbacks: list[int] = []
        self.candidate_words: tuple[str, ...] = corpus.answers
        self.solved = False

    @abstractmethod
    def reset(self, config: GameConfig) -> None:
        raise NotImplementedError

    @abstractmethod
    def apply_guess(self, guess: str) -> int:
        raise NotImplementedError

    def is_terminal(self) -> bool:
        return self.solved or self.is_exhausted()

    def is_exhausted(self) -> bool:
        return self.max_turns is not None and len(self.guesses) >= self.max_turns and not self.solved

    def snapshot(self) -> Observation:
        return Observation(
            mode=self.mode,
            turn=len(self.guesses),
            max_turns=self.max_turns,
            guesses=tuple(self.guesses),
            feedbacks=tuple(self.feedbacks),
            solved=self.solved,
            exhausted=self.is_exhausted(),
            candidates=self.candidate_words,
        )

    def _validate_guess(self, guess: str) -> str:
        normalized = guess.lower()
        if not self.corpus.validate_guess(normalized):
            raise ValueError(f"Invalid guess: {guess}")
        if self.is_terminal():
            raise ValueError("Game is already terminal.")
        return normalized
```

- [ ] **Step 2: Create `engine/src/wordlegym/environments/standard.py`**

```python
from __future__ import annotations

from ..corpus import WordCorpus
from ..feedback import is_all_correct, score_guess
from .base import BaseEnvironment, GameConfig


class StandardEnvironment(BaseEnvironment):
    mode = "standard"

    def __init__(self, corpus: WordCorpus) -> None:
        super().__init__(corpus)
        self.hidden_answer = corpus.answers[0]

    def reset(self, config: GameConfig) -> None:
        self.hidden_answer = config.hidden_answer or self.corpus.answers[0]
        self.max_turns = config.max_turns
        self.guesses = []
        self.feedbacks = []
        self.candidate_words = self.corpus.answers
        self.solved = False

    def apply_guess(self, guess: str) -> int:
        normalized = self._validate_guess(guess)
        pattern = score_guess(normalized, self.hidden_answer)
        self.guesses.append(normalized)
        self.feedbacks.append(pattern)
        self.candidate_words = tuple(
            candidate for candidate in self.candidate_words if score_guess(normalized, candidate) == pattern
        )
        self.solved = is_all_correct(pattern)
        return pattern
```

- [ ] **Step 3: Create `engine/src/wordlegym/environments/evil.py`**

```python
from __future__ import annotations

from collections import defaultdict

from ..feedback import is_all_correct, pattern_counts, pattern_to_text, score_guess
from .base import BaseEnvironment, GameConfig


class EvilEnvironment(BaseEnvironment):
    mode = "evil"

    def reset(self, config: GameConfig) -> None:
        self.max_turns = config.max_turns
        self.guesses = []
        self.feedbacks = []
        self.candidate_words = self.corpus.answers
        self.solved = False

    def apply_guess(self, guess: str) -> int:
        normalized = self._validate_guess(guess)
        buckets: dict[int, list[str]] = defaultdict(list)
        for candidate in self.candidate_words:
            buckets[score_guess(normalized, candidate)].append(candidate)

        def bucket_key(item: tuple[int, list[str]]) -> tuple[int, int, int, tuple[int, ...]]:
            pattern, words = item
            greens, yellows = pattern_counts(pattern)
            digits = tuple(int(value) for value in pattern_to_text(pattern, absent="0", present="1", correct="2"))
            return (-len(words), greens, yellows, digits)

        pattern, survivors = min(buckets.items(), key=bucket_key)
        self.guesses.append(normalized)
        self.feedbacks.append(pattern)
        self.candidate_words = tuple(sorted(survivors))
        self.solved = is_all_correct(pattern) and len(self.candidate_words) == 1
        return pattern
```

- [ ] **Step 4: Create `engine/src/wordlegym/environments/unknown.py`**

```python
from __future__ import annotations

import random
from collections import defaultdict

from ..corpus import WordCorpus
from ..feedback import score_guess, pattern_counts, pattern_to_text
from ..observation import ModePosterior, Observation
from .base import BaseEnvironment, GameConfig
from .evil import EvilEnvironment
from .standard import StandardEnvironment


class UnknownEnvironment(BaseEnvironment):
    mode = "unknown"

    def __init__(self, corpus: WordCorpus) -> None:
        super().__init__(corpus)
        self.standard_env = StandardEnvironment(corpus)
        self.evil_env = EvilEnvironment(corpus)
        self.hidden_mode = "standard"
        self.mode_prior = 0.5
        self.random = random.Random(7)
        self.standard_consistent = True
        self.evil_consistent = True
        self.standard_candidate_words = corpus.answers
        self.evil_candidate_words = corpus.answers

    def reset(self, config: GameConfig) -> None:
        self.max_turns = config.max_turns
        self.mode_prior = config.mode_prior
        self.random = random.Random(config.seed)
        self.hidden_mode = config.hidden_mode or ("evil" if self.random.random() < config.mode_prior else "standard")
        self.standard_env.reset(GameConfig(hidden_answer=config.hidden_answer, max_turns=config.max_turns))
        self.evil_env.reset(GameConfig(max_turns=config.max_turns))
        self.guesses = []
        self.feedbacks = []
        self.candidate_words = self.corpus.answers
        self.standard_candidate_words = self.corpus.answers
        self.evil_candidate_words = self.corpus.answers
        self.standard_consistent = True
        self.evil_consistent = True
        self.solved = False

    def apply_guess(self, guess: str) -> int:
        normalized = self._validate_guess(guess)
        if self.hidden_mode == "standard":
            pattern = self.standard_env.apply_guess(normalized)
        else:
            pattern = self.evil_env.apply_guess(normalized)

        self.guesses.append(normalized)
        self.feedbacks.append(pattern)
        self.standard_candidate_words = tuple(
            candidate
            for candidate in self.standard_candidate_words
            if score_guess(normalized, candidate) == pattern
        )
        self.standard_consistent = bool(self.standard_candidate_words)

        if not self.evil_consistent:
            self.evil_candidate_words = ()
        else:
            expected_evil_pattern = self._evil_expected_pattern(self.guesses[:-1], self.feedbacks[:-1], normalized)
            if expected_evil_pattern != pattern:
                self.evil_consistent = False
                self.evil_candidate_words = ()
            else:
                self.evil_candidate_words = tuple(
                    candidate for candidate in self.evil_candidate_words if score_guess(normalized, candidate) == pattern
                )
                self.evil_consistent = bool(self.evil_candidate_words)

        combined = set(self.standard_candidate_words) | set(self.evil_candidate_words)
        self.candidate_words = tuple(sorted(combined or set(self.standard_candidate_words)))
        self.solved = self.standard_env.solved if self.hidden_mode == "standard" else self.evil_env.solved
        return pattern

    def snapshot(self) -> Observation:
        posterior = self._mode_posterior()
        return Observation(
            mode=self.mode,
            turn=len(self.guesses),
            max_turns=self.max_turns,
            guesses=tuple(self.guesses),
            feedbacks=tuple(self.feedbacks),
            solved=self.solved,
            exhausted=self.is_exhausted(),
            candidates=self.candidate_words,
            standard_candidates=self.standard_candidate_words,
            evil_candidates=self.evil_candidate_words,
            mode_posterior=posterior,
            standard_consistent=self.standard_consistent,
            evil_consistent=self.evil_consistent,
        )

    def _mode_posterior(self) -> ModePosterior:
        initial_count = len(self.corpus.answers)
        standard_likelihood = len(self.standard_candidate_words) / initial_count if self.standard_consistent else 0.0
        evil_likelihood = 1.0 if self.evil_consistent else 0.0
        unnormalized_standard = (1.0 - self.mode_prior) * standard_likelihood
        unnormalized_evil = self.mode_prior * evil_likelihood
        total = unnormalized_standard + unnormalized_evil
        if total == 0:
            return ModePosterior(standard=0.5, evil=0.5)
        return ModePosterior(
            standard=unnormalized_standard / total,
            evil=unnormalized_evil / total,
        )

    def _evil_expected_pattern(
        self, prior_guesses: list[str], prior_feedbacks: list[int], next_guess: str
    ) -> int:
        candidates = self.corpus.answers
        for guess, pattern in zip(prior_guesses, prior_feedbacks):
            candidates = tuple(candidate for candidate in candidates if score_guess(guess, candidate) == pattern)

        buckets: dict[int, list[str]] = defaultdict(list)
        for candidate in candidates:
            buckets[score_guess(next_guess, candidate)].append(candidate)

        def bucket_key(item: tuple[int, list[str]]) -> tuple[int, int, int, tuple[int, ...]]:
            pattern, words = item
            greens, yellows = pattern_counts(pattern)
            digits = tuple(int(value) for value in pattern_to_text(pattern, absent="0", present="1", correct="2"))
            return (-len(words), greens, yellows, digits)

        return min(buckets.items(), key=bucket_key)[0]
```

- [ ] **Step 5: Create `engine/src/wordlegym/environments/__init__.py`**

```python
from .base import BaseEnvironment, GameConfig
from .evil import EvilEnvironment
from .standard import StandardEnvironment
from .unknown import UnknownEnvironment

__all__ = [
    "BaseEnvironment",
    "EvilEnvironment",
    "GameConfig",
    "StandardEnvironment",
    "UnknownEnvironment",
]
```

- [ ] **Step 6: Delete the old `environments.py` file**

```bash
git rm engine/src/wordlegym/environments.py
```

- [ ] **Step 7: Run all tests**

```bash
cd engine && uv run python -m unittest discover -s tests
```

Expected: all pass. The package re-exports preserve every import path from the prior monolithic file (`from wordlegym.environments import StandardEnvironment` still works).

- [ ] **Step 8: Re-run smoke benchmark to verify byte-identical output**

```bash
cd engine && uv run python -c "
from pathlib import Path
import json
from wordlegym.benchmark import BenchmarkRunner
from wordlegym.corpus import WordCorpus
from wordlegym.strategies import build_strategies
corpus = WordCorpus(answers=('cigar','rebut','sissy','humph'), allowed_guesses=('aahed','cigar','rebut','sissy','humph'))
runner = BenchmarkRunner(Path('..'), corpus=corpus, strategies=build_strategies(corpus))
out = runner.run()
print(json.dumps({'summaries': out['summaries'], 'robustness': out['robustness']}, sort_keys=True, indent=2))
" > tests/_after_env_split.txt

diff tests/_baseline.txt tests/_after_env_split.txt && echo IDENTICAL
```

Expected: prints `IDENTICAL`.

- [ ] **Step 9: Commit**

```bash
git add engine/src/wordlegym/environments/
git commit -m "refactor(engine): split environments.py into a package

base.py owns BaseEnvironment + GameConfig; standard/evil/unknown.py
each own one environment class. Public import path
\`wordlegym.environments.{StandardEnvironment, ...}\` is preserved
via the package __init__."
```

---

## Task 12: Split `strategies.py` into `baselines/` package + `strategy.py` + `registry.py`

**Files:**
- Create: `engine/src/wordlegym/strategy.py`
- Create: `engine/src/wordlegym/registry.py`
- Create: `engine/src/wordlegym/baselines/__init__.py`
- Create: `engine/src/wordlegym/baselines/random_valid.py`
- Create: `engine/src/wordlegym/baselines/letter_frequency.py`
- Create: `engine/src/wordlegym/baselines/partition.py`
- Create: `engine/src/wordlegym/baselines/posterior_hybrid.py`
- Create: `engine/src/wordlegym/baselines/evil_shortest_path.py`
- Create: `engine/src/wordlegym/baselines/posterior_expectimax.py`
- Create: `engine/src/wordlegym/baselines/robust_scalarization.py`
- Create: `engine/src/wordlegym/baselines/evil_dp/__init__.py`
- Create: `engine/src/wordlegym/baselines/evil_dp/strategy.py`
- Create: `engine/src/wordlegym/baselines/evil_dp/cache.py`
- Delete: `engine/src/wordlegym/strategies.py`
- Modify: `engine/src/wordlegym/benchmark.py` (one import line)
- Modify: `engine/tests/test_strategies.py` (import paths)

This is a long task but each file is a verbatim extract of a class from the existing `strategies.py`. Do them all in one task because the partial state isn't useful — the test suite only goes green again at the end.

- [ ] **Step 1: Create `engine/src/wordlegym/strategy.py`** (the `StrategyBase` ABC, lifted unchanged from `strategies.py`)

```python
from __future__ import annotations

from dataclasses import dataclass, field

from .analysis import FeedbackTable
from .corpus import WordCorpus
from .decision import Decision
from .observation import Observation


@dataclass
class StrategyBase:
    corpus: WordCorpus
    table: FeedbackTable
    id: str
    label: str
    objective: str
    decision_cache: dict[tuple[object, ...], Decision] = field(default_factory=dict, init=False, repr=False)

    def choose_guess(self, snapshot: Observation) -> Decision:
        raise NotImplementedError

    def _candidate_pool(self, snapshot: Observation) -> tuple[str, ...]:
        if snapshot.mode == "unknown":
            standard = snapshot.standard_candidates or ()
            evil = snapshot.evil_candidates or ()
            combined = tuple(sorted(set(standard) | set(evil)))
            return combined or snapshot.candidates
        return snapshot.candidates

    def _guess_pool(self, snapshot: Observation) -> tuple[str, ...]:
        return self._candidate_pool(snapshot)

    def _break_tie(self, current: tuple | None, challenger: tuple) -> bool:
        return current is None or challenger < current

    def _cache_key(self, snapshot: Observation) -> tuple[object, ...]:
        if snapshot.mode == "unknown":
            posterior = snapshot.mode_posterior.to_dict() if snapshot.mode_posterior is not None else {"standard": 0.5, "evil": 0.5}
            return (
                snapshot.mode,
                snapshot.standard_candidates or (),
                snapshot.evil_candidates or (),
                round(posterior["standard"], 6),
                round(posterior["evil"], 6),
            )
        return (snapshot.mode, snapshot.candidates)
```

- [ ] **Step 2: Create `engine/src/wordlegym/baselines/random_valid.py`**

```python
from __future__ import annotations

import random

from ..decision import Decision
from ..hash_utils import decision_state_hash
from ..observation import Observation
from ..strategy import StrategyBase


class RandomValidStrategy(StrategyBase):
    """Baseline: pseudo-random pick over the current candidate set.

    The seed is a deterministic hash of the decision state, so identical states
    always produce identical guesses. This is a reproducible lower-bound control
    condition, not an algorithmic contribution.
    """

    def choose_guess(self, snapshot: Observation) -> Decision:
        cache_key = self._cache_key(snapshot)
        if cache_key in self.decision_cache:
            return self.decision_cache[cache_key]
        pool = self._candidate_pool(snapshot)
        seed = int(decision_state_hash(snapshot)[:12], 16)
        decision = Decision(guess=random.Random(seed).choice(pool), explanation={"seed": seed, "pool_size": len(pool)})
        self.decision_cache[cache_key] = decision
        return decision
```

- [ ] **Step 3: Create `engine/src/wordlegym/baselines/letter_frequency.py`**

```python
from __future__ import annotations

from collections import Counter

from ..decision import Decision
from ..observation import Observation
from ..strategy import StrategyBase


class LetterFrequencyStrategy(StrategyBase):
    """Baseline: cheap candidate-only heuristic.

    Scores each candidate by a weighted sum of positional letter frequency and
    global unique-letter frequency within the current candidate set. The ``0.4``
    global weight is a heuristic design choice, not derived from an optimality
    argument; this strategy does not reason about feedback-pattern partitions,
    so it may overvalue common letters that fail to split the candidate set.
    """

    def choose_guess(self, snapshot: Observation) -> Decision:
        cache_key = self._cache_key(snapshot)
        if cache_key in self.decision_cache:
            return self.decision_cache[cache_key]
        pool = self._candidate_pool(snapshot)
        positional = [Counter(word[index] for word in pool) for index in range(5)]
        global_counts = Counter(letter for word in pool for letter in set(word))
        best_score = -1.0
        best_guess = pool[0]
        explanation: dict[str, float | int | str] = {}
        for guess in pool:
            seen: set[str] = set()
            global_score = 0
            for letter in guess:
                if letter not in seen:
                    global_score += global_counts[letter]
                    seen.add(letter)
            positional_score = sum(positional[index][letter] for index, letter in enumerate(guess))
            score = positional_score + (0.4 * global_score)
            if score > best_score or (score == best_score and guess < best_guess):
                best_score = score
                best_guess = guess
                explanation = {
                    "score": round(score, 4),
                    "global_score": global_score,
                    "positional_score": positional_score,
                    "pool_size": len(pool),
                }
        decision = Decision(guess=best_guess, explanation=explanation)
        self.decision_cache[cache_key] = decision
        return decision
```

- [ ] **Step 4: Create `engine/src/wordlegym/baselines/partition.py`** (PartitionStrategy + 3 subclasses)

Read `engine/src/wordlegym/strategies.py:153-242` (the four class definitions: `PartitionStrategy`, `CandidateEliminationStrategy`, `EntropyStrategy`, `MinimaxStrategy`). Copy those class bodies verbatim into a new file with this header replacing the original imports:

```python
from __future__ import annotations

from ..decision import Decision
from ..metrics import expected_remaining, reduction_ratio, shannon_entropy, worst_case_bucket
from ..observation import Observation
from ..strategy import StrategyBase
```

The classes themselves do not change. After Task 8 they already use `Observation` / `Decision` / `snapshot.candidates`, so this is a pure file move.

- [ ] **Step 5: Create `engine/src/wordlegym/baselines/posterior_hybrid.py`**

Header:

```python
from __future__ import annotations

import math

from ..decision import Decision
from ..metrics import reduction_ratio, shannon_entropy, worst_case_bucket
from ..observation import Observation
from ..strategy import StrategyBase
```

Body: read `engine/src/wordlegym/strategies.py:245-313` (`class PosteriorHybridStrategy`) and copy the class verbatim under the header above.

- [ ] **Step 6: Create `engine/src/wordlegym/baselines/evil_shortest_path.py`**

Header:

```python
from __future__ import annotations

from ..decision import Decision
from ..metrics import evil_forced_bucket_size, shannon_entropy
from ..observation import Observation
from ..strategy import StrategyBase
```

Body: read `engine/src/wordlegym/strategies.py:316-361` (`class EvilShortestPathStrategy`) and copy the class verbatim under the header above.

- [ ] **Step 7: Create `engine/src/wordlegym/baselines/posterior_expectimax.py`**

Header:

```python
from __future__ import annotations

from ..decision import Decision
from ..metrics import evil_forced_bucket_size, expected_remaining
from ..observation import Observation
from ..strategy import StrategyBase
```

Body: read `engine/src/wordlegym/strategies.py:364-431` (`class PosteriorExpectimaxStrategy`) and copy the class verbatim under the header above.

- [ ] **Step 8: Create `engine/src/wordlegym/baselines/robust_scalarization.py`**

Header:

```python
from __future__ import annotations

from ..decision import Decision
from ..metrics import evil_forced_bucket_size, expected_remaining
from ..observation import Observation
from ..strategy import StrategyBase
```

Body: read `engine/src/wordlegym/strategies.py:434-484` (`class RobustScalarizationStrategy`) and copy the class verbatim under the header above.

- [ ] **Step 9: Create `engine/src/wordlegym/baselines/evil_dp/cache.py`**

```python
from __future__ import annotations

import json
import os
from pathlib import Path

EVIL_DP_CACHE_ENV = "WORDLEGYM_EVIL_DP_CACHE_DIR"


def default_cache_dir() -> Path:
    """``results/cache/`` relative to the repo root (four parents up from this file)."""
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
```

(The `parents[5]` path arithmetic accounts for the new nesting: `engine/src/wordlegym/baselines/evil_dp/cache.py` → `engine/`. Verify in Step 13.)

- [ ] **Step 10: Create `engine/src/wordlegym/baselines/evil_dp/strategy.py`**

Header:

```python
from __future__ import annotations

from ...decision import Decision
from ...metrics import PATTERN_EVIL_TIEBREAK, evil_forced_bucket_size, shannon_entropy
from ...observation import Observation
from ...strategy import StrategyBase
from .cache import cache_path, load_policy, save_policy

EVIL_DP_DEFAULT_BEAM = 100
```

Body: read `engine/src/wordlegym/strategies.py:496-712` (`class EvilDPStrategy`) and copy the class verbatim under the header. Then replace its inline cache helpers (`_cache_path`, `_load_cache`, `_save_cache` — currently 35 lines around `strategies.py:530-569`) with these compact versions:

```python
    def _cache_path(self):
        return cache_path(corpus_size=len(self.corpus.answers), beam=self._dp_beam)

    def _load_cache(self) -> bool:
        loaded = load_policy(self._cache_path())
        if loaded is None:
            return False
        self._dp_policy = loaded
        return True

    def _save_cache(self) -> None:
        save_policy(self._cache_path(), corpus_size=len(self.corpus.answers), beam=self._dp_beam, policy=self._dp_policy)
```

Also delete the module-level `EVIL_DP_DEFAULT_BEAM = 100` and `EVIL_DP_CACHE_ENV = "WORDLEGYM_EVIL_DP_CACHE_DIR"` and `_default_evil_dp_cache_dir` helper from the body — `EVIL_DP_DEFAULT_BEAM` is now defined in the header above; `EVIL_DP_CACHE_ENV` and `default_cache_dir` live in `cache.py`. The `_solve` and `_greedy_evil_step` methods are unchanged.

- [ ] **Step 11: Create `engine/src/wordlegym/baselines/evil_dp/__init__.py`**

```python
from .strategy import EVIL_DP_DEFAULT_BEAM, EvilDPStrategy

__all__ = ["EVIL_DP_DEFAULT_BEAM", "EvilDPStrategy"]
```

- [ ] **Step 12: Create `engine/src/wordlegym/registry.py`** (move `STRATEGY_REGISTRY`, `StrategyMetadata`, `build_strategies` here verbatim)

```python
from __future__ import annotations

from typing import NamedTuple

from .analysis import FeedbackTable
from .baselines.evil_dp import EvilDPStrategy
from .baselines.evil_shortest_path import EvilShortestPathStrategy
from .baselines.letter_frequency import LetterFrequencyStrategy
from .baselines.partition import (
    CandidateEliminationStrategy,
    EntropyStrategy,
    MinimaxStrategy,
)
from .baselines.posterior_expectimax import PosteriorExpectimaxStrategy
from .baselines.posterior_hybrid import PosteriorHybridStrategy
from .baselines.random_valid import RandomValidStrategy
from .baselines.robust_scalarization import RobustScalarizationStrategy
from .corpus import WordCorpus
from .strategy import StrategyBase


class StrategyMetadata(NamedTuple):
    cls: type[StrategyBase]
    label: str
    objective: str
    tier: str
    caveat: str


STRATEGY_REGISTRY: dict[str, StrategyMetadata] = {
    "random-valid": StrategyMetadata(
        cls=RandomValidStrategy,
        label="Random Valid",
        objective="Deterministic seeded random play over feasible answers.",
        tier="baseline",
        caveat="Reproducible lower-bound control, not a competitive solver.",
    ),
    "letter-frequency": StrategyMetadata(
        cls=LetterFrequencyStrategy,
        label="Letter Frequency",
        objective="Maximize weighted letter coverage over feasible answers.",
        tier="baseline",
        caveat="Ignores feedback-pattern partitions; 0.4 global weight is heuristic.",
    ),
    "candidate-elimination": StrategyMetadata(
        cls=CandidateEliminationStrategy,
        label="Candidate Elimination",
        objective="Minimize expected remaining candidates (one-step Bayes objective).",
        tier="core",
        caveat="Greedy per-turn; does not guarantee globally optimal expected guesses.",
    ),
    "expected-entropy": StrategyMetadata(
        cls=EntropyStrategy,
        label="Expected Entropy",
        objective="Maximize Shannon information gain per guess.",
        tier="core",
        caveat="Greedy per-turn; high entropy can leave awkward subproblems later.",
    ),
    "minimax": StrategyMetadata(
        cls=MinimaxStrategy,
        label="Minimax",
        objective="Minimize the worst-case remaining candidate bucket.",
        tier="core",
        caveat="One-ply worst case; not globally minimax-optimal over the decision tree.",
    ),
    "posterior-hybrid": StrategyMetadata(
        cls=PosteriorHybridStrategy,
        label="Posterior Hybrid",
        objective="Posterior-weighted blend of standard-mode entropy and evil-mode worst-case reduction.",
        tier="experimental",
        caveat="Heuristic blend -- not the Bayes-optimal Unknown-mode policy.",
    ),
    "evil-shortest-path": StrategyMetadata(
        cls=EvilShortestPathStrategy,
        label="Evil Shortest Path",
        objective="Minimize the evil-forced successor bucket |T(C,g)| (one-ply approximation of D(C)).",
        tier="aggregate-aware",
        caveat="One-ply greedy -- exact shortest-path D(C) requires recursive branch-and-bound.",
    ),
    "posterior-expectimax": StrategyMetadata(
        cls=PosteriorExpectimaxStrategy,
        label="Posterior Expectimax",
        objective="One-step Bayesian expectimax: q * E[|C_next|] + (1 - q) * |T(C,g)|.",
        tier="aggregate-aware",
        caveat="Depth-1 approximation of the Bayesian limited-depth expectimax from the spec.",
    ),
    "robust-scalarization": StrategyMetadata(
        cls=RobustScalarizationStrategy,
        label="Robust Scalarization",
        objective="Minimax across modes: minimize max(E[|C_next|], |T(C,g)|).",
        tier="aggregate-aware",
        caveat="One-step scalarization -- true robust optimum searches the Pareto frontier recursively.",
    ),
    "evil-dp": StrategyMetadata(
        cls=EvilDPStrategy,
        label="Evil DP",
        objective="Memoized shortest-path DP D(C) for Evil mode (beam search K=100, ~83s first-run, cached to disk).",
        tier="optimal",
        caveat="Evil mode only -- Standard and Unknown fall back to one-ply evil-forced-bucket greedy.",
    ),
}


def build_strategies(corpus: WordCorpus) -> dict[str, StrategyBase]:
    table = FeedbackTable(corpus)
    return {
        strategy_id: meta.cls(corpus=corpus, table=table, id=strategy_id, label=meta.label, objective=meta.objective)
        for strategy_id, meta in STRATEGY_REGISTRY.items()
    }
```

- [ ] **Step 13: Create `engine/src/wordlegym/baselines/__init__.py`** (re-exports)

```python
from .evil_dp import EvilDPStrategy
from .evil_shortest_path import EvilShortestPathStrategy
from .letter_frequency import LetterFrequencyStrategy
from .partition import (
    CandidateEliminationStrategy,
    EntropyStrategy,
    MinimaxStrategy,
    PartitionStrategy,
)
from .posterior_expectimax import PosteriorExpectimaxStrategy
from .posterior_hybrid import PosteriorHybridStrategy
from .random_valid import RandomValidStrategy
from .robust_scalarization import RobustScalarizationStrategy

__all__ = [
    "CandidateEliminationStrategy",
    "EntropyStrategy",
    "EvilDPStrategy",
    "EvilShortestPathStrategy",
    "LetterFrequencyStrategy",
    "MinimaxStrategy",
    "PartitionStrategy",
    "PosteriorExpectimaxStrategy",
    "PosteriorHybridStrategy",
    "RandomValidStrategy",
    "RobustScalarizationStrategy",
]
```

- [ ] **Step 14: Update `engine/src/wordlegym/benchmark.py` import line**

Find:

```python
from .strategies import STRATEGY_REGISTRY, StrategyBase, build_strategies
```

Replace with:

```python
from .registry import STRATEGY_REGISTRY, build_strategies
from .strategy import StrategyBase
```

- [ ] **Step 15: Update `engine/tests/test_strategies.py` imports**

Replace the top of the file:

```python
from __future__ import annotations

import unittest

from wordlegym.analysis import FeedbackTable
from wordlegym.baselines import (
    CandidateEliminationStrategy,
    EntropyStrategy,
    EvilDPStrategy,
    EvilShortestPathStrategy,
    LetterFrequencyStrategy,
    MinimaxStrategy,
    PosteriorExpectimaxStrategy,
    PosteriorHybridStrategy,
    RandomValidStrategy,
    RobustScalarizationStrategy,
)
from wordlegym.corpus import WordCorpus
from wordlegym.environments import StandardEnvironment, GameConfig
from wordlegym.registry import build_strategies
```

(`build_strategies` was previously imported from `wordlegym.strategies`; everything else is the same set of names.)

- [ ] **Step 16: Update `engine/tests/test_benchmark.py` imports**

Find:

```python
from wordlegym.strategies import build_strategies
```

Replace with:

```python
from wordlegym.registry import build_strategies
```

- [ ] **Step 17: Verify the `default_cache_dir` parents arithmetic in `evil_dp/cache.py`**

```bash
cd engine && uv run python -c "
from pathlib import Path
import wordlegym.baselines.evil_dp.cache as c
print('default_cache_dir:', c.default_cache_dir())
expected = Path(__file__).resolve().parents[1] / 'results' / 'cache'
print('expected:        ', Path('..').resolve() / 'results' / 'cache')
"
```

Expected: both paths resolve to `<repo_root>/results/cache`. If they don't match, adjust the `parents[N]` index in `default_cache_dir()`.

- [ ] **Step 18: Delete the old `strategies.py`**

```bash
git rm engine/src/wordlegym/strategies.py
```

- [ ] **Step 19: Run all tests**

```bash
cd engine && uv run python -m unittest discover -s tests
```

Expected: all pass.

- [ ] **Step 20: Re-run smoke benchmark for byte-identical output**

```bash
cd engine && uv run python -c "
from pathlib import Path
import json
from wordlegym.benchmark import BenchmarkRunner
from wordlegym.corpus import WordCorpus
from wordlegym.registry import build_strategies
corpus = WordCorpus(answers=('cigar','rebut','sissy','humph'), allowed_guesses=('aahed','cigar','rebut','sissy','humph'))
runner = BenchmarkRunner(Path('..'), corpus=corpus, strategies=build_strategies(corpus))
out = runner.run()
print(json.dumps({'summaries': out['summaries'], 'robustness': out['robustness']}, sort_keys=True, indent=2))
" > tests/_after_strategies_split.txt

diff tests/_baseline.txt tests/_after_strategies_split.txt && echo IDENTICAL
```

Expected: prints `IDENTICAL`.

- [ ] **Step 21: Commit**

```bash
git add engine/src/wordlegym/strategy.py engine/src/wordlegym/registry.py \
        engine/src/wordlegym/baselines/ engine/src/wordlegym/benchmark.py \
        engine/tests/test_strategies.py engine/tests/test_benchmark.py
git commit -m "refactor(engine): split strategies.py into baselines/ + strategy.py + registry.py

strategy.py owns StrategyBase. baselines/ holds one file per
strategy class (evil_dp/ is its own subpackage with strategy.py
and cache.py for disk-cache helpers). registry.py owns
STRATEGY_REGISTRY and build_strategies. All tests still green;
toy benchmark output is byte-identical."
```

---

## Task 13: Update `wordlegym/__init__.py` for the new public surface

**Files:**
- Modify: `engine/src/wordlegym/__init__.py`

- [ ] **Step 1: Replace the file contents**

```python
from .benchmark import BenchmarkRunner
from .corpus import WordCorpus
from .decision import Decision
from .environments import EvilEnvironment, GameConfig, StandardEnvironment, UnknownEnvironment
from .feedback import (
    TileState,
    decode_pattern,
    encode_pattern,
    pattern_to_emoji,
    pattern_to_text,
    score_guess,
)
from .observation import ModePosterior, Observation
from .registry import STRATEGY_REGISTRY, build_strategies
from .strategy import StrategyBase
from .trace import GameTrace, GuessTraceStep

__all__ = [
    "BenchmarkRunner",
    "Decision",
    "EvilEnvironment",
    "GameConfig",
    "GameTrace",
    "GuessTraceStep",
    "ModePosterior",
    "Observation",
    "STRATEGY_REGISTRY",
    "StandardEnvironment",
    "StrategyBase",
    "TileState",
    "UnknownEnvironment",
    "WordCorpus",
    "build_strategies",
    "decode_pattern",
    "encode_pattern",
    "pattern_to_emoji",
    "pattern_to_text",
    "score_guess",
]
```

- [ ] **Step 2: Add a `test_imports` smoke test for the package surface**

Append to `engine/tests/test_imports.py` (above `if __name__`):

```python
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
```

- [ ] **Step 3: Run all tests**

```bash
cd engine && uv run python -m unittest discover -s tests
```

Expected: all tests pass, including the new `PackageSurfaceTests.test_top_level_reexports`.

- [ ] **Step 4: Commit**

```bash
git add engine/src/wordlegym/__init__.py engine/tests/test_imports.py
git commit -m "feat(engine): publish v1.0 public surface from wordlegym/__init__.py

Top-level re-exports cover the renamed types (Observation, Decision)
and the new module homes (registry, strategy, trace) so users can
\`from wordlegym import Observation, StandardEnvironment\` without
caring about internal layout."
```

---

## Task 14: Final regression sweep + cleanup

**Files:**
- Delete: `engine/tests/_baseline.txt`, `engine/tests/_after_renames.txt`, `engine/tests/_after_env_split.txt`, `engine/tests/_after_strategies_split.txt`

- [ ] **Step 1: Run the full test suite one more time, with verbose output**

```bash
cd engine && uv run python -m unittest discover -s tests -v
```

Expected: all tests pass; total count >= 23 (5 envs + 12 strategies + 3 cache + 3 feedback + ≥3 imports + 1 benchmark smoke).

- [ ] **Step 2: Run a real benchmark on the full canonical corpus**

```bash
cd engine && time uv run python -c "
from pathlib import Path
from wordlegym.benchmark import BenchmarkRunner
runner = BenchmarkRunner(Path('..'))
out = runner.run()
print('strategies:', len(out['summaries']['standard']))
print('first row:', out['summaries']['standard'][0])
"
```

Expected: completes (this is the canonical 2315-answer benchmark; runtime 5–15 minutes in pure Python depending on machine, dominated by the DP strategy first run if the cache is cold). The first row of `summaries['standard']` should match what was published in [results/web/summaries.json](../../results/web/summaries.json) for the same strategy id — confirm field shape (key names) hasn't changed.

(If the DP cache-cold runtime is unacceptable for plan-execution, set `WORDLEGYM_EVIL_DP_CACHE_DIR` to point at the existing repo cache: `WORDLEGYM_EVIL_DP_CACHE_DIR=$PWD/../results/cache`.)

- [ ] **Step 3: Confirm `wordlegym.cli generate` still works end-to-end**

```bash
cd engine && uv run python -m wordlegym.cli --help
```

Expected: argparse help text including `generate` and `sync-web-data` subcommands.

- [ ] **Step 4: Delete the temporary baseline files**

```bash
rm -f engine/tests/_baseline.txt engine/tests/_after_renames.txt \
      engine/tests/_after_env_split.txt engine/tests/_after_strategies_split.txt
```

(These were never committed; this just clears the working tree.)

- [ ] **Step 5: Confirm clean git status**

```bash
git status
```

Expected: only the intentional changes from this plan show up. No stray files in `engine/tests/_*.txt`.

- [ ] **Step 6: Final review — read the diff of the whole branch**

```bash
git log --oneline main..HEAD
git diff --stat main..HEAD
```

Expected: ~9 commits (Tasks 2, 3, 4, 5, 6+7+8+9 combined, 10, 11, 12, 13). Diff stat shows `models.py`, `environments.py`, `strategies.py` removed; new `observation.py`, `decision.py`, `trace.py`, `strategy.py`, `registry.py`, `environments/`, `baselines/` added; `__init__.py`, `feedback.py`, `hash_utils.py`, `benchmark.py`, all 4 test files modified.

---

## Self-review checklist (run before declaring the plan done)

- All 7 spec issues this plan touches: only **#3** (engine ↔ web decoupling) and the structural prerequisite for **#1** / **#2** are in scope. The renames + module split are pure groundwork for Phases 2–10. Issues #1 (plugin system), #2 (Strategy SDK formalization), #4–#7 (CLI, Gymnasium adapter, reproducibility model, packaging) are explicitly deferred and tracked in the Spec §11 migration sequence.
- No file mentioned in the "File Structure" section is missing a task.
- Every code block in this plan is complete enough to paste-and-run; no `...` placeholders.
- Field renames are consistent everywhere they appear: `candidates`, `standard_candidates`, `evil_candidates` (no stray `candidate_words` outside private env state).
- The test suite is exercised after every commit; the toy-benchmark byte-equality check appears at the three highest-risk transition points (Tasks 9, 11, 12).
- After Task 14, the engine is functionally identical to its pre-plan state, just with renamed types and a clean module layout. No new behavior — all of that is Phase 2+ work.

# WordleGym v1.0 — Public Gym Foundation

**Status:** Design draft
**Date:** 2026-04-20
**Scope:** Foundational refactor of the engine package so WordleGym is credible as a public, pip-installable, externally-extensible Gym. Targets ML researchers, solver authors, and educators simultaneously by getting the core API contract right and letting audience-specific surfaces (Gymnasium adapter, CLI, web app, leaderboard) live as downstream consumers of one clean engine.
**Breaking-change budget:** Hard reset to v1.0. No deprecation shims. The repo will go public with v1.0; there is no PyPI install base to honor.

---

## 1. Goals

1. `pip install wordlegym` works on Python 3.10+, no monorepo checkout required.
2. An out-of-tree solver author can publish a strategy plugin in < 50 lines of code and have it auto-discovered by `wordlegym list`.
3. An RL researcher can `gym.make("wordlegym/Standard-v1")` and plug it into Stable-Baselines / CleanRL with no engine knowledge.
4. The engine package has zero knowledge that a web app exists.
5. Every benchmark result is byte-reproducible from `(corpus_hash, engine_version, seed, strategy_id)`.
6. A user can sanity-check the install end-to-end via CLI without ever cloning the repo.

## 2. Non-goals

- New strategies, new environments, new metrics. This refactor preserves all existing behavior.
- Multiplayer / asynchronous Wordle variants.
- A hosted leaderboard service. (Artifact format must *enable* one; we don't host it here.)
- Python 3.9 support. The codebase already uses 3.10+ syntax; we just fix the `requires-python` claim.

## 3. Architecture overview

```
wordlegym/                       # single distribution, optional extras
├── __init__.py                  # re-exports public API
├── corpus.py                    # WordCorpus, hashing, word-list loading
├── feedback.py                  # score_guess, encode/decode_pattern, pattern_to_emoji
├── observation.py               # Observation dataclass (renamed GameSnapshot)
├── decision.py                  # Decision dataclass (renamed StrategyDecision)
├── strategy.py                  # Strategy ABC + @register decorator
├── registry.py                  # process-global registry + entry-point discovery
├── environments/
│   ├── __init__.py
│   ├── base.py                  # BaseEnvironment (renamed BaseEnvironment)
│   ├── standard.py
│   ├── evil.py
│   └── unknown.py
├── baselines/
│   ├── __init__.py              # imports each baseline module to fire @register
│   ├── random_valid.py
│   ├── letter_frequency.py
│   ├── partition.py             # CandidateElimination, Entropy, Minimax
│   ├── posterior_hybrid.py
│   ├── evil_shortest_path.py
│   ├── posterior_expectimax.py
│   ├── robust_scalarization.py
│   └── evil_dp/
│       ├── __init__.py
│       ├── strategy.py
│       └── cache.py
├── benchmark.py                 # BenchmarkRunner — pure compute, returns BenchmarkResult
├── artifacts.py                 # BenchmarkResult, write_bundle(), read_bundle()
├── cli.py                       # argparse-based CLI (entry point: `wordlegym`)
└── gym/                         # OPTIONAL extra: pip install wordlegym[gym]
    ├── __init__.py              # registers gym envs on import
    ├── env.py                   # WordleEnv (gymnasium.Env adapter)
    └── wrappers.py              # InfoGainRewardWrapper, etc.

scripts/                         # repo-level, NOT part of the package
└── sync_web_artifacts.py        # copies results/web/* into apps/web/public/generated/
```

The four conceptual layers and their direction of dependency:

```
[corpus, feedback, observation, decision]   ← primitives, zero engine deps
            ↑
[environments, strategy, registry]          ← core engine
            ↑
[baselines, benchmark, artifacts]           ← bundled solvers + runner + IO
            ↑
[cli, gym]                                  ← consumers; depend on everything below
```

`gym/` is reachable only from outside the engine; nothing in the engine imports it. `cli/` imports the engine but the engine never imports the CLI. The web app and any leaderboard service consume `artifacts.py` output and have no other coupling.

## 4. Public API contract (the v1.0 surface)

### 4.1 Primitives

`Observation` (frozen dataclass — renamed from `GameSnapshot`):

```python
@dataclass(frozen=True)
class Observation:
    mode: Literal["standard", "evil", "unknown"]
    turn: int
    max_turns: int | None
    guesses: tuple[str, ...]
    feedbacks: tuple[int, ...]
    candidates: tuple[str, ...]              # combined feasible set
    solved: bool
    exhausted: bool
    # Unknown-mode fields, None in other modes:
    standard_candidates: tuple[str, ...] | None = None
    evil_candidates: tuple[str, ...] | None = None
    mode_posterior: ModePosterior | None = None
```

`Decision` (frozen dataclass — renamed from `StrategyDecision`):

```python
@dataclass(frozen=True)
class Decision:
    guess: str
    explanation: Mapping[str, Any] = MappingProxyType({})
```

Field renames (`candidate_words → candidates`, `standard_candidate_words → standard_candidates`, etc.) are intentional: they shorten the most-typed names and remove the "_words" stutter that the old API picked up.

### 4.2 Strategy ABC + registration decorator

```python
from wordlegym import Strategy, register, Observation, Decision

@register(
    id="my-solver",
    label="My Solver",
    tier="experimental",                     # baseline | core | experimental | aggregate-aware | optimal
    objective="One-line plain-English description.",
    caveat="Honest limitation users should know.",
)
class MySolver(Strategy):
    def setup(self, *, corpus: WordCorpus, rng: np.random.Generator) -> None:
        """Optional. Called once before the first act()."""
        ...

    def act(self, obs: Observation) -> Decision:
        """Required. Returns the next guess."""
        ...

    def reset(self) -> None:
        """Optional. Called between games. Default: no-op."""
        ...
```

`Strategy` is an ABC with:
- abstract `act(obs) -> Decision`
- default `setup(corpus, rng)` no-op
- default `reset()` no-op
- class attribute `metadata: StrategyMetadata` injected by the `@register` decorator

The `@register` decorator both (a) attaches metadata to the class and (b) inserts the class into the process-global `wordlegym.registry` keyed by `id`.

### 4.3 Environment ABC

```python
class BaseEnvironment(ABC):
    mode: ClassVar[str]

    def reset(self, *, seed: int | None = None, **mode_kwargs) -> Observation: ...
    def step(self, guess: str) -> tuple[Observation, int, bool, bool, dict]: ...
        # returns (obs, reward, terminated, truncated, info) — Gymnasium 5-tuple shape,
        # but reward is the per-step reward as defined in §4.5.
    def is_terminal(self) -> bool: ...
```

Renames: `apply_guess → step`, `snapshot → observe()` (or auto-returned by `step`/`reset`). The Gymnasium 5-tuple is adopted at the engine level so the gym adapter is a one-line passthrough rather than a translation layer.

### 4.4 Registry & plugin discovery

```python
# wordlegym/registry.py
def register(*, id, label, tier, objective, caveat="") -> Callable[[type[Strategy]], type[Strategy]]
def get(strategy_id: str) -> type[Strategy]
def all_strategies() -> Mapping[str, StrategyMetadata]
def discover_plugins() -> None    # imports every entry-point in group "wordlegym.strategies"
```

`discover_plugins()` runs at most once per process and is triggered lazily on the first call to `registry.get()` or `registry.all_strategies()`. Users who want explicit timing (e.g., to see which packages were imported, or to fail fast on a broken plugin) can call it themselves up-front. External plugins declare:

```toml
[project.entry-points."wordlegym.strategies"]
my_solver = "my_pkg.strategies"
```

The value is a module path; importing it triggers the `@register` decorators inside.

### 4.5 Reward model (engine + Gymnasium)

Per-step reward returned by `BaseEnvironment.step`:

- `+1.0` if this step solved the puzzle (`pattern == 242`)
- `0.0` otherwise

Cumulative reward over a game = `1.0` if solved, `0.0` if exhausted. The actual benchmark objective (penalized average guesses) is reconstructed in `benchmark.py` from `info["turn"]` and `terminated/truncated`. Sparse signal is correct for the domain; reward shaping is opt-in via Gymnasium wrappers.

`wordlegym.gym.wrappers.InfoGainRewardWrapper` adds Shannon-entropy of the post-guess partition to each step's reward — useful for RL training, never used by the benchmark.

### 4.6 Reproducibility

- `WordCorpus.hash` returns SHA-256 of `answers || "\n" || allowed_guesses`.
- Every `BenchmarkResult` carries `(engine_version, corpus_hash, seed, strategy_metadata)`.
- Strategies receive `rng: np.random.Generator` in `setup()`; any randomness must come from it.
- Evil-mode tie-breaks are documented as `(largest_size, fewest_greens, fewest_yellows, lex_smallest_pattern)` and tested for byte-stability.
- DP cache files include `(corpus_hash, beam, engine_version)` in their filename so cache invalidation is automatic.

## 5. CLI surface

Entry point: `wordlegym = wordlegym.cli:main` registered in `pyproject.toml`.

| Command | Behavior |
|---|---|
| `wordlegym list` | Prints registered strategies grouped by tier, with metadata. Calls `discover_plugins()` first. |
| `wordlegym info` | Prints engine version, corpus hash, answer/allowed counts, install location. |
| `wordlegym play [--strategy ID] [--mode standard\|evil\|unknown] [--seed N]` | Interactive REPL. Without `--strategy`, the user types guesses; with `--strategy`, the strategy plays and the user observes step-by-step. |
| `wordlegym evaluate STRATEGY [--mode MODE] [--answers FILE\|sample:N] [--seed N]` | Runs the strategy over the chosen answer set, prints a one-strategy summary table. |
| `wordlegym bench [--out DIR] [--strategies a,b,c] [--seed N]` | Runs the full benchmark, writes the v1 artifact bundle to `--out` (default `./results/`). |
| `wordlegym replay TRACE.jsonl[.gz]` | Pretty-prints a single trace turn-by-turn with emoji feedback. |

All commands emit machine-readable JSON to stdout when `--json` is passed.

## 6. Artifact schema (v1)

A benchmark run produces a single bundle directory:

```
result/
├── bundle.json                  # BenchmarkResult metadata + summaries + robustness
├── traces/
│   ├── standard.jsonl.gz
│   ├── evil.jsonl.gz
│   └── unknown.jsonl.gz
└── parity-fixtures.json         # cross-implementation parity test cases
```

`bundle.json` shape:

```json
{
  "schema_version": 1,
  "engine_version": "1.0.0",
  "corpus_hash": "sha256:...",
  "seed": 7,
  "answers": 2315,
  "allowed_guesses": 12972,
  "strategies": [
    {"id": "...", "label": "...", "tier": "...", "objective": "...", "caveat": "..."}
  ],
  "summaries": { "<mode>": [<row>, ...] },
  "robustness": { "matrix": {...}, "mismatch_spread": [...] },
  "decision_snapshots": [...],
  "sample_replays": { "<mode>": { "<strategy>": <trace> } }
}
```

Old `summaries.json`, `robustness.json`, etc. become **derived views** — the web app loads `bundle.json` and slices it for each page. This collapses six files into one and removes the schema-drift risk from having multiple files of the same data.

## 7. Engine ↔ web boundary

- Engine writes the bundle to `--out` (CLI default `./results/`).
- The web app reads from `apps/web/public/generated/`.
- A standalone repo script `scripts/sync_web_artifacts.py` copies the bundle and unpacks the legacy per-file views the web app currently expects (no engine code change).
- `BenchmarkRunner._sync_web_assets`, `BenchmarkRunner.sync_web_data`, and the `sync-web-data` CLI subcommand are **deleted** from the engine.
- During the migration the web app continues to read the legacy file names (which the sync script writes); a separate follow-up refactors the web app to consume `bundle.json` directly.

## 8. Gymnasium adapter (extras: `[gym]`)

Lives in `wordlegym/gym/env.py`. Registers three envs on import:

- `wordlegym/Standard-v1`
- `wordlegym/Evil-v1`
- `wordlegym/Unknown-v1`

`WordleEnv(gymnasium.Env)`:

- `observation_space`: `Dict({"turn": Discrete, "guesses": MultiDiscrete, "feedbacks": MultiDiscrete, "candidates_mask": MultiBinary(len(answers))})`
- `action_space`: `Discrete(len(allowed))` — each action is an index into the allowed-guess vocabulary; the env exposes `env.unwrapped.vocab` for reverse lookup.
- `reset(seed=None, options=None)` → `(obs, info)`
- `step(action)` → `(obs, reward, terminated, truncated, info)`
- `info` includes the full domain `Observation` under `info["domain"]` so RL agents that *want* the rich snapshot can opt in.

Reward shaping wrappers in `wordlegym/gym/wrappers.py` (InfoGain, RemainingCandidates) compose normally.

## 9. Packaging

`pyproject.toml`:

```toml
[project]
name = "wordlegym"
version = "1.0.0"
requires-python = ">=3.10"
dependencies = ["numpy>=1.26"]
license = "MIT"
classifiers = [...]

[project.optional-dependencies]
gym  = ["gymnasium>=1.0"]
dev  = ["pytest>=8", "pytest-cov", "ruff", "mypy"]

[project.scripts]
wordlegym = "wordlegym.cli:main"

[project.entry-points."wordlegym.strategies"]
# Engine bundles its own baselines via this same mechanism, dogfooding the plugin system:
baselines = "wordlegym.baselines"
```

CI (GitHub Actions): on tag `v*`, build sdist + wheel, publish to PyPI via OIDC trusted publisher. On every PR: lint + type-check + test matrix on Python 3.10, 3.11, 3.12.

## 10. Test strategy

Three test layers:

1. **Unit** (`tests/unit/`) — feedback parity, evil tie-breaks, registry decorator, observation field renames.
2. **Property** (`tests/property/`) — `score_guess(g, a) == score_guess(g, a)` (idempotence), pattern decode↔encode round-trip, evil-env determinism under fixed seed.
3. **Integration** (`tests/integration/`) — `wordlegym evaluate` over a 10-answer subsample for each strategy, asserts solve rate matches a frozen golden table; full `bench` golden hash test (regenerated via `pytest --update-goldens`).
4. **Plugin contract** (`tests/integration/test_plugin_discovery.py`) — installs a tiny `tests/fixtures/dummy_plugin/` package via `pip install -e`, asserts `wordlegym list` shows the dummy strategy.
5. **Gym contract** (`tests/integration/test_gym_env.py`, `[gym]` extra only) — `gymnasium.utils.env_checker.check_env(WordleEnv())` passes for all three modes.

## 11. Migration sequence

The refactor is large but each step is reviewable independently. Plan-time order:

1. Module split + renames (no behavior change). Old test suite passes against new module paths.
2. `Strategy` ABC + `@register` decorator + dogfood baselines through it. Registry unit tests pass.
3. Reward + step 5-tuple in `BaseEnvironment`. Update strategies and benchmark to consume new shape.
4. `artifacts.py` + new bundle format. `BenchmarkRunner` emits *only* the new bundle. Web-compatibility per-file shape is generated by the sync script in step 6, not by the engine.
5. CLI rewrite: `list`, `info`, `play`, `evaluate`, `bench`, `replay`. Old `generate` / `sync-web-data` deleted.
6. `scripts/sync_web_artifacts.py` extracted. It reads `bundle.json` and writes the legacy `summaries.json` / `robustness.json` / `decision-snapshots.json` / `sample-replays.json` / `manifest.json` shape into `apps/web/public/generated/`. Engine has no path references to `apps/` anywhere.
7. `wordlegym/gym/` adapter + tests behind `[gym]` extra.
8. `pyproject.toml` to v1.0, requires-python 3.10, console_script, entry-points, optional-deps.
9. CI workflow + PyPI trusted-publisher config.
10. README rewrite: install, quickstart, "write your own strategy" tutorial, RL quickstart, contributing guide.

Each step lands as its own PR.

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Field renames break the web app | Sync script translates `bundle.json` → legacy per-file shape until web app is updated in a follow-up. |
| Entry-point auto-discovery imports unsafe code | Document that `discover_plugins()` runs Python; users opt in by installing the plugin. Standard pattern (pytest, gymnasium). |
| Gymnasium `check_env` rejects our `Dict` obs space | Validated in spike before adoption; if rejected, fall back to `Tuple` with clear info dict carrying the domain object. |
| DP cache invalidation surprises users | Cache filename includes `corpus_hash` + `engine_version` + beam; old caches are silently ignored, regenerated on demand. |
| `numpy` becomes a hard dependency where it wasn't | Justified by RNG (`np.random.Generator`) and Gymnasium space shapes. Tiny cost; ubiquitous. |
| Plugin author's strategy has a slow `act()` and tanks `wordlegym bench` | Add a per-strategy timeout flag (`--timeout-per-game-seconds`); document expectations in the plugin guide. |

## 13. Open questions to resolve in the implementation plan

- Exact `WordCorpus` hash inputs (do we include allowed-guesses, or just answers?). Default: both, in canonical sort order, joined by `\n`, lowercased.
- Whether `wordlegym play` interactive mode uses `prompt_toolkit` or stdlib `input()`. Default: stdlib for zero deps; consider extra later.
- Whether `BenchmarkRunner` parallelizes across strategies (`multiprocessing.Pool`). Default: no, single process; revisit if `bench` runtime becomes a complaint.
- Whether `bundle.json` embeds full traces or only references `traces/*.jsonl.gz`. Default: references only; full traces stay in JSONL for streaming.

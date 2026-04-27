# WordleGym

A research benchmark for Wordle-playing policies under standard, adversarial (*evil*), and mode-uncertain settings. Ships with ten reference strategies, an exact dynamic program where tractable, documented one-ply heuristics where it is not, and a Next.js viewer for interactive play and results exploration.

Created for Math 242 at Duke University, Spring 2026.

![python](https://img.shields.io/badge/python-%E2%89%A53.9-blue)
![next.js](https://img.shields.io/badge/next.js-15-black)
![react](https://img.shields.io/badge/react-19-61dafb)
![status](https://img.shields.io/badge/status-research-orange)

---

## Overview

WordleGym formalizes Wordle as a sequential decision problem and evaluates policies across three environments:

- **Standard** — the hidden answer is fixed and drawn from the canonical 2,315-word pool.
- **Evil** — feedback is adversarially chosen to preserve the largest feasible answer set at every turn.
- **Unknown** — the environment mode is fixed at reset but hidden; a Bayesian posterior over `{standard, evil}` drives decisions.

The Python engine is authoritative (stdlib-only, no runtime deps). The web app consumes the JSON artifacts the engine emits and never recomputes benchmark numbers.

## Highlights

- **10 reference strategies** spanning random/frequency baselines, one-ply partition heuristics, mode-aware hybrids, and an exact evil-mode DP.
- **Exact `D(C)` optimum for Evil mode** via beam-memoized shortest-path DP (K=100). `evil-dp` resolves the deterministic adversarial game in **4 turns** — one turn ahead of every greedy alternative.
- **Benchmarked against the published Standard-mode optimum** (`V(A) = 3.421`, Bertsimas & Paskov 2025). The best heuristic here averages **3.465** — a 0.044-turn / 1.3% gap.
- **Full benchmark artifacts**: summaries, robustness matrices, decision-tree snapshots, sample replays, simulator/walkthrough metadata, and gzipped per-game traces.
- **Interactive web viewer** (Next.js 15 / React 19) with solver autoplay, replay scrubbing, and parity-tested game semantics.
- **Rigorous metadata**: every strategy carries a tier label and a caveat documenting exactly how it departs from the Bayes-optimal policy — surfaced from the Python registry into the UI.

## Leaderboard

Benchmarked over the canonical 2,315-answer pool. Reported values are solve depths; weak baselines are allowed to run past the six-turn Wordle limit so their failure modes remain measurable.

### Standard mode — `V(A) = 3.421` reference optimum ([Bertsimas & Paskov 2025](https://doi.org/10.1287/opre.2022.0434))

| Rank | Strategy                | Tier             | Avg guesses | Worst case | Gap to optimum |
| :--: | :---------------------- | :--------------- | :---------: | :--------: | :------------: |
|  1   | `expected-entropy`      | Core             |    3.465    |     6      |    +0.044      |
|  1   | `posterior-hybrid`      | Experimental     |    3.465    |     6      |    +0.044      |
|  3   | `posterior-expectimax`  | Aggregate-aware  |    3.485    |     5      |    +0.064      |
|  4   | `candidate-elimination` | Core             |    3.486    |     5      |    +0.065      |
|  5   | `evil-shortest-path`    | Aggregate-aware  |    3.514    |     5      |    +0.093      |
|  5   | `evil-dp`               | Optimal (evil)   |    3.514    |     5      |    +0.093      |
|  7   | `robust-scalarization`  | Aggregate-aware  |    3.517    |     5      |    +0.096      |
|  8   | `minimax`               | Core             |    3.573    |     6      |    +0.152      |
|  9   | `letter-frequency`      | Baseline         |    3.587    |     8      |    +0.166      |
|  10  | `random-valid`          | Baseline         |    4.124    |     9      |    +0.703      |

### Evil mode — exact `D(A) = 4`

| Rank | Strategy                      | Forced depth |
| :--: | :---------------------------- | :------------: |
|  1   | **`evil-dp`**                 |     **4**      |
|  2   | all other non-random policies |       5        |
|  …   | `random-valid`                |       7        |

Evil mode has no hidden answer to average over. The adversary deterministically returns the largest surviving feedback bucket, so each strategy has one forced path and the reported depth equals the worst case.

### Unknown mode — 2,316 games per strategy, averaged across standard + evil branches

| Rank | Strategy                | Avg guesses | Worst case |
| :--: | :---------------------- | :---------: | :--------: |
|  1   | `expected-entropy`      |    4.232    |     6      |
|  2   | `posterior-hybrid`      |    4.237    |     6      |
|  3   | `candidate-elimination` |    4.243    |     5      |
|  4   | `posterior-expectimax`  |    4.248    |     5      |
|  5   | `evil-shortest-path`    |    4.257    |     5      |
|  5   | `evil-dp`               |    4.257    |     5      |
|  7   | `robust-scalarization`  |    4.259    |     5      |
|  8   | `minimax`               |    4.287    |     6      |
|  9   | `letter-frequency`      |    4.294    |     8      |
|  10  | `random-valid`          |    4.996    |     9      |

Full per-strategy summaries: [`results/web/summaries.json`](results/web/summaries.json). Robustness matrices, decision snapshots, simulator metadata, and walkthrough metadata are written alongside.

## Installation

WordleGym is two independent packages sharing one repo.

### Engine — Python ≥3.9 (stdlib only)

```bash
cd engine
uv sync
```

### Web app — Node 20+

```bash
cd apps/web
npm install
```

## Quickstart

### Run the full benchmark

```bash
cd engine
uv run python -m wordlegym.cli generate
```

Evaluates all 10 strategies across standard / evil / unknown modes, writes artifacts to `results/web/`, and syncs them into `apps/web/public/generated/`. First run takes ~80s because `evil-dp` computes its DP; subsequent runs load the on-disk cache instantly.

### Launch the interactive viewer

```bash
cd apps/web
npm run dev   # http://localhost:3000
```

### Run the tests

```bash
# Engine
cd engine && uv run python -m unittest discover -s tests

# Web
cd apps/web && npm run test
```

### Minimal engine example

```python
from pathlib import Path

from wordlegym.corpus import WordCorpus
from wordlegym.environments import GameConfig, StandardEnvironment
from wordlegym.registry import build_strategies

corpus = WordCorpus.from_repo_root(Path(".."))  # run from engine/
strategies = build_strategies(corpus)

env = StandardEnvironment(corpus)
env.reset(GameConfig(hidden_answer="raise", max_turns=6))
solver = strategies["expected-entropy"]

while not env.is_terminal():
    decision = solver.choose_guess(env.snapshot())
    env.apply_guess(decision.guess)

print(f"solved={env.solved} in {len(env.guesses)} turns")
```

## Project layout

```
engine/                Python package `wordlegym` — game semantics, strategies, benchmark runner.
  src/wordlegym/
    corpus.py            Canonical answer + allowed-guess corpora.
    feedback.py          Ternary-encoded Wordle scoring (base-3 over {ABSENT, PRESENT, CORRECT}).
    analysis.py          Precomputed (guess, answer) -> pattern table.
    environments/        Standard / Evil / Unknown environments.
    strategy.py          StrategyBase ABC.
    baselines/           One file per strategy (evil_dp/ is a subpackage with on-disk cache).
    registry.py          STRATEGY_REGISTRY — canonical metadata table.
    benchmark.py         BenchmarkRunner — summaries, robustness, traces.
  scripts/               Reproducible emitters for simulator and walkthrough JSON.
apps/web/              Next.js 15 + React 19 viewer.
  src/lib/
    game-core.ts         TypeScript port of engine semantics (parity-tested).
    generated-data.ts    Reads JSON artifacts the engine produces.
    strategy-content.ts  Long-form strategy tutorials rendered at /docs/<strategy>.
data/                  Canonical Wordle answer + allowed-guess lists.
docs/                  Benchmark specification + DP methodology notes.
poster/                LaTeX writeup, poster, and reproducible poster figures.
results/               Benchmark artifacts: `raw/` gzipped traces, `web/` JSON for the app.
```

## Benchmark specification

The full spec lives in [`docs/benchmark-spec.md`](docs/benchmark-spec.md); the DP methodology notes are in [`docs/dp-methods.md`](docs/dp-methods.md). Highlights:

- **Reported depth**: benchmark summaries report turns until solved. The runner uses a 12-turn runaway safeguard, not the six-turn Wordle UI cap, so weak baselines can be compared instead of collapsing into identical failures.
- **Evil tie-break**: fewer greens, fewer yellows, lexicographically smallest pattern.
- **Unknown posterior**: 0.5 prior over `{standard, evil}`; reported metrics average both branches per answer.

### Exact aggregate-optimal recurrences and their practical approximations

| Mode      | Metric             | Optimal formulation                                        | Implemented as                  |
| :-------- | :----------------- | :--------------------------------------------------------- | :------------------------------ |
| Standard  | Average guesses    | `V(C) = min_g [1 + Σ (|B_r|/|C|) V(B_r)]`                  | `candidate-elimination`         |
| Standard  | Worst-case guesses | `W(C) = min_g [1 + max_r W(B_r)]`                          | `minimax`                       |
| Evil      | Turns to terminal  | `D(C) = min_g [1 + D(T(C, g))]`                            | `evil-dp` (exact, K=100)        |
| Unknown   | Average guesses    | Bayesian mixture DP `V_U(C)` over `q` posterior            | `posterior-expectimax`          |
| Unknown   | Worst-case guesses | Minimax mixture DP `W_U(C)`                                | `minimax + evil-shortest-path`  |
| Any       | Robustness spread  | Pareto frontier of `(J_std, J_evil)`                       | `robust-scalarization`          |

Only `evil-dp` is exact. Every other strategy is a one-ply heuristic and the `caveat` field on its registry entry documents exactly how it departs from the optimum. See [`docs/dp-methods.md`](docs/dp-methods.md) for the literature and the reason full DPs are prohibitive at Wordle scale outside Evil mode.

## Strategies

| Strategy                | Tier             | Local objective                                                                                  |
| :---------------------- | :--------------- | :----------------------------------------------------------------------------------------------- |
| `random-valid`          | Baseline         | Seeded random pick from the candidate set.                                                       |
| `letter-frequency`      | Baseline         | Weighted positional + global unique-letter frequency over candidates.                            |
| `candidate-elimination` | Core             | Minimize expected remaining candidates `Σ n² / N`.                                               |
| `expected-entropy`      | Core             | Maximize Shannon entropy `-Σ p log₂ p` of the feedback-pattern distribution.                     |
| `minimax`               | Core             | Minimize the worst-case surviving bucket `max_p |S_p(g)|`.                                       |
| `posterior-hybrid`      | Experimental     | Posterior-weighted blend of normalized standard entropy and evil-mode reduction ratio.           |
| `evil-shortest-path`    | Aggregate-aware  | Minimize the evil-forced successor bucket `|T(C, g)|` (one-ply approximation of `D(C)`).         |
| `posterior-expectimax`  | Aggregate-aware  | `q · Σ|B_r|²/|C| + (1 − q) · |T(C, g)|` with `q = P(std \| history)`.                            |
| `robust-scalarization`  | Aggregate-aware  | `min max(Σ|B_r|²/|C|, |T(C, g)|)` across modes.                                                  |
| `evil-dp`               | **Optimal**      | Memoized shortest-path DP with beam K=100 over the full allowed pool.                            |

### Tiers

- **Baseline** — control conditions that make benchmark deltas interpretable, not algorithmic contributions.
- **Core** — principled one-ply partition heuristics; each optimizes a well-defined local objective, not global expected cost.
- **Experimental** — hybrid heuristics designed for the Unknown posterior setting. Coherent and useful as benchmarks, not Bayes-optimal.
- **Aggregate-aware** — one-step approximations of the exact aggregate-optimal trees; the full DPs are computationally prohibitive at Wordle scale.
- **Optimal (where tractable)** — exact DP solutions for subproblems where the recurrence is tractable. Currently covers Evil mode only.

Full derivations, pseudocode, and per-strategy strengths/weaknesses: [`apps/web/src/lib/strategy-content.ts`](apps/web/src/lib/strategy-content.ts) and the `/docs/<strategy>` pages in the web app.

## Writeup And Poster

The accompanying research writeup is in [`poster/`](poster/):

- [`poster/wordle_gym_writeup.pdf`](poster/wordle_gym_writeup.pdf) — compiled supplementary writeup
- [`poster/wordle_gym_writeup.tex`](poster/wordle_gym_writeup.tex) — writeup LaTeX source
- [`poster/wordle_gym_poster.pdf`](poster/wordle_gym_poster.pdf) — compiled research poster
- [`poster/wordle_gym_poster.tex`](poster/wordle_gym_poster.tex) — poster LaTeX source

## Citation

If you build on WordleGym, please cite it alongside the foundational literature it benchmarks against.

```bibtex
@software{wordlegym2026,
  title  = {WordleGym: A research benchmark for Wordle policies},
  author = {Wang, Michael},
  year   = {2026},
  url    = {https://github.com/Michael-OvO/WordleGym},
  note   = {Final project, Math 242, Duke University, Spring 2026}
}
```

## References

- Bertsimas, D., & Paskov, A. (2025). *An Exact Solution to Wordle.* [*Operations Research*, 73(3), 1384–1394](https://doi.org/10.1287/opre.2022.0434).
- Selby, A. (2022). *The best strategies for Wordle.* [sonorouschocolate.com](https://sonorouschocolate.com/notes/index.php?title=The_best_strategies_for_Wordle).
- Poirrier, L. (2022). *Mathematical optimization over Wordle decision trees.* [poirrier.ca/notes/wordle](https://www.poirrier.ca/notes/wordle/).

## Acknowledgments

Built for Math 242 at Duke University, Spring 2026. Wordle answer list and allowed-guess list sourced from the public New York Times lexicon.

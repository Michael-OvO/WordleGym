# WordleGym

WordleGym is a research playground for studying Wordle strategy under standard, adversarial, and hidden-mode settings.

> **Final project for Math 242, Duke University — Spring 2026.**

## Paper

The accompanying research writeup is in [`poster/`](poster/):

- [`poster/writeup.pdf`](poster/writeup.pdf) — compiled writeup / poster
- [`poster/writeup.tex`](poster/writeup.tex) — LaTeX source

## Structure

- `engine/` Python package for game semantics, strategies, benchmarks, and artifact generation
- `apps/web/` Next.js app for interactive play, solver autoplay, and results exploration
- `data/` Canonical Wordle answers and allowed guesses
- `results/` Raw traces and web-ready benchmark artifacts
- `docs/` Benchmark specification and methodology notes

## Quick Start

### Engine

```bash
cd engine
uv sync
uv run python -m wordlegym.cli generate
uv run python -m unittest discover -s tests
```

### Web App

```bash
cd apps/web
npm install
npm run dev
```

## Benchmark Modes

- `standard`: fixed hidden answer from the canonical answer list
- `evil`: adversarial feedback that preserves the largest feasible answer set
- `unknown`: hidden fixed mode chosen at reset as either `standard` or `evil`

## Strategies

WordleGym strategies are **benchmark policies**, not claimed optimal solvers. Some are intentionally simple baselines; others are one-ply partition heuristics. The partition-based strategies optimize local feedback metrics, which may differ from aggregate objectives such as average guesses, worst-case guesses, solve rate, or penalized average guesses.

| Strategy                | Tier             | Local objective                                                                                  | Caveat                                                                                                  |
| ----------------------- | ---------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `random-valid`          | Baseline         | Seeded random pick from the candidate set (no optimization).                                     | Reproducible lower-bound control condition, not a competitive solver.                                   |
| `letter-frequency`      | Baseline         | Weighted positional + global unique-letter frequency over the candidate set.                     | Ignores feedback-pattern partitions; the `0.4` global weight is a tunable design choice.                |
| `candidate-elimination` | Core             | Minimize expected remaining candidates `Σ n² / N` (one-step Bayes objective).                    | Greedy per-turn; not guaranteed to minimize total expected guesses over the full decision tree.         |
| `expected-entropy`      | Core             | Maximize Shannon entropy `-Σ p log₂ p` of the feedback-pattern distribution.                     | High-entropy guesses can create awkward late-game subproblems. Not globally optimal.                    |
| `minimax`               | Core             | Minimize the worst-case surviving bucket `max_p |S_p(g)|`.                                       | One-ply worst case; the true minimax-optimal policy minimizes worst-case decision-tree depth recursively. |
| `posterior-hybrid`      | Experimental     | Posterior-weighted blend of normalized standard entropy and evil-mode reduction ratio.           | Heuristic blend — not the Bayes-optimal Unknown-mode policy. The blended components are on similar scales but measure different quantities. |
| `evil-shortest-path`    | Aggregate-aware  | Minimize the evil-forced successor bucket `|T(C, g)|` (one-ply approximation of `D(C)`).        | One-ply greedy — exact `D(C)` requires recursive branch-and-bound over the deterministic evil subset graph. |
| `posterior-expectimax`  | Aggregate-aware  | One-step Bayesian expectimax `q · Σ|B_r|²/|C| + (1 − q) · |T(C, g)|` with `q = P(std \| history)`. | Depth-1 truncation of the spec's limited-depth expectimax; leaf values are one-step cost estimates, not recursive value functions. |
| `robust-scalarization`  | Aggregate-aware  | Minimax over modes: minimize `max(Σ|B_r|²/|C|, |T(C, g)|)`.                                      | One-step scalarization — true robust optimum searches the Pareto frontier recursively.                  |
| `evil-dp`               | Optimal          | Memoized shortest-path DP `D(C) = min_g [1 + D(T(C,g))]` with beam K=100 over the full allowed pool. | Evil mode only — Standard and Unknown fall back to the greedy evil-forced-bucket objective.             |

### Tiers

- **Baseline** — Control conditions that make benchmark deltas interpretable. Not algorithmic contributions.
- **Core greedy partition** — Principled one-ply partition heuristics. Each optimizes a well-defined local objective, not global expected-cost.
- **Experimental mode-aware** — Hybrid heuristics designed for the Unknown posterior setting. Coherent, useful as benchmarks, but not Bayes-optimal.
- **Aggregate-aware (practical)** — One-step approximations of the exact aggregate-optimal decision trees from the benchmark spec. The full DPs are computationally prohibitive at Wordle scale; these strategies implement the spec's named practical-candidate policies.
- **Optimal (where tractable)** — Exact dynamic-program solutions for subproblems where the DP is actually tractable. At Wordle scale this currently covers Evil mode only: deterministic successors shrink the reachable subset graph to a few thousand nodes, so memoized DFS with a modest beam recovers the true `D(C)` optimum.

### Exact aggregate-optimal algorithms (reference only)

The benchmark spec in [`docs/benchmark-spec.md`](docs/benchmark-spec.md) derives the exact recurrences below. [`docs/dp-methods.md`](docs/dp-methods.md) records the published optimal bounds, cites the literature (Bertsimas & Paskov 2022, Selby 2022, Poirrier 2022), and explains why the engine implements exact DP only for Evil mode and backs off to practical-candidate approximations elsewhere.

| Mode      | Metric                          | Optimal formulation                                                              | Practical approximation implemented here |
| --------- | ------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| Standard  | Average guesses                 | Expected-depth DP `V(C) = min_g [1 + Σ (|B_r|/|C|) V(B_r)]`                      | `candidate-elimination`                  |
| Standard  | Worst-case guesses              | Minimax-depth DP `W(C) = min_g [1 + max_r W(B_r)]`                               | `minimax`                                |
| Standard  | Solve rate / penalized average  | Finite-horizon Bayes-risk DP `J_h(C)`                                            | None — use the above as proxies          |
| Evil      | Turns to terminal               | Shortest-path DP `D(C) = min_g [1 + D(T(C, g))]`                                 | `evil-dp` (exact, beam K=100) / `evil-shortest-path` (one-ply)                  |
| Unknown   | Average guesses                 | Bayesian mixture DP `V_U(C)` over the `q` posterior and evil-forced branch      | `posterior-expectimax`                   |
| Unknown   | Worst-case guesses              | Minimax mixture DP `W_U(C)` over standard buckets plus the evil-forced branch   | `minimax` + `evil-shortest-path`         |
| Any       | Robustness spread               | Multi-objective policy search over the Pareto frontier of `(J_std, J_evil)`     | `robust-scalarization`                   |

See [`apps/web/src/lib/strategy-content.ts`](apps/web/src/lib/strategy-content.ts) and the `/docs/<strategy>` pages in the web app for the full derivations, pseudocode, and per-strategy strengths/weaknesses.

## Notes

- Benchmarks use the official Wordle answer list and allowed-guess list.
- Solver policies evaluate over the canonical answer pool for tractability, while interactive play validates guesses against the full allowed list.
- Strategy tier and caveat metadata flow from the Python `STRATEGY_REGISTRY` through the generated manifest into the web app, so documentation stays consistent with the engine.

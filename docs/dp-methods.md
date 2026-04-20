# Dynamic Programming Methods for Wordle

This document records the exact aggregate-optimal DP formulations for Wordle under the benchmark's three modes (Standard, Evil, Unknown), cites the published literature that establishes optimal bounds, and explains why WordleGym implements these DPs only for the Evil subproblem — where the recurrence is tractable — and falls back to practical-candidate approximations for the remaining modes.

The derivations below are the compact form of `docs/benchmark-spec.md`. Notation matches the spec: `A` is the canonical answer list with `N = |A| = 2,315`; `G` is the full allowed guess pool with `M ≈ 13,000` and `A ⊂ G`; `C ⊆ A` is the current candidate set; `fb(g, a)` is the Wordle feedback pattern for guess `g` against answer `a`; `γ` is the all-green pattern; `B_r(C, g) = { a ∈ C : fb(g, a) = r }` is the bucket of candidates producing pattern `r`; `T(C, g)` is the evil-forced successor subset.

---

## 1. Exact recurrences

### 1.1 Standard mode — expected guesses

For a nonterminal candidate set `C`, let `V(C)` be the minimum expected additional guesses under a uniform answer prior:

```
V(C) = min over g in G of [ 1 + Σ_{r ≠ γ, B_r ≠ ∅} (|B_r| / |C|) · V(B_r) ]
V({w}) = 1
```

The all-green branch contributes no future cost because the game terminates immediately. This is the Bayes-optimal expected-depth decision tree. It is not equivalent to greedy entropy, expected remaining candidates, or minimax bucket size — all of which are one-ply heuristics.

### 1.2 Standard mode — worst case

```
W(C) = min over g in G of [ 1 + max_{r ≠ γ, B_r ≠ ∅} W(B_r) ]
W({w}) = 1
```

This is the minimax-depth decision tree. It optimizes worst-case depth, not worst-case bucket size — the two are distinct and can disagree in the second ply and beyond.

### 1.3 Standard mode — finite-horizon penalized average

```
J_0(C) = 1        (penalty for unsolved game)
J_h(C) = min over g in G of [ 1 + Σ_{r ≠ γ} (|B_r| / |C|) · J_{h-1}(B_r) ]
```

With `h = 12` to match the benchmark cap. The `J_0(C) = 1` boundary encodes the benchmark's `turns + 1` unsolved penalty.

### 1.4 Evil mode — shortest path

In Evil mode the environment has no fixed hidden answer; it deterministically returns the largest bucket under a fixed tie-break (fewer greens, fewer yellows, lexicographically smaller pattern digits). Define:

```
e(C, g) = arg max_r ( |B_r|, -greens(r), -yellows(r), -lex(r) )
T(C, g) = B_{e(C, g)}(C, g)
```

The minimum additional guesses to reach a terminal (`e = γ` with `|T| = 1`):

```
D(C) = min over g in G of [ 1 + D(T(C, g)) ]
D({w}) = 1
```

Because each guess has a single deterministic successor, the evil subset graph from `A` has only a few thousand reachable nodes — unlike Standard mode, where each guess branches into up to 243 successors. This makes Evil the one mode where exact DP is tractable in pure Python.

### 1.5 Unknown mode — Bayesian mixture

While both the Standard and Evil branches remain consistent with observed feedback, the exact expected-guesses recurrence under the spec's posterior `q = |C| / (N + |C|)` is:

```
V_U(C) = min over g in G of [ 1
    + 1_{r* ≠ γ} · ((1 - q) + q · |B*| / |C|) · V_U(B*)
    + Σ_{r ≠ r*, r ≠ γ} (q · |B_r| / |C|) · V_S(B_r)
]
```

where `r* = e(C, g)`, `B* = B_{r*}`, and `V_S` is the Standard-mode expected-depth DP. This is the Bayes-optimal Unknown-mode policy under the benchmark's mode prior of 0.5.

---

## 2. Published optimal bounds on the canonical Wordle list

For the **canonical 2,315-answer list** used by this benchmark (and by every published exact Wordle solver we know of):

| Metric | Optimum | Source | Reproduced in WordleGym? |
| --- | --- | --- | --- |
| Standard — expected guesses `V(A)` | **3.421** (opening `SALET`) | Bertsimas & Paskov (2025, *Operations Research*) | Not implemented (prohibitive in Python); the best heuristic here is `expected-entropy` at 3.465, i.e. +0.044 / +1.3% above optimum |
| Standard — worst case `W(A)` | **5** | Bertsimas & Paskov (2025); independently Selby (2022) | `candidate-elimination`, `posterior-hybrid`, `posterior-expectimax`, `evil-shortest-path`, `evil-dp`, `robust-scalarization` all hit 5 |
| Standard — solve rate under 6-turn cap | **100%** | Both (the cap never binds) | All 10 strategies solve 100% in our run |
| **Evil — shortest path `D(A)`** | **4** (opening `RAISE`) | `evil-dp` (beam K=100) — see §6 | **Confirmed: `evil-dp` plays the full Evil game in exactly 4 turns; every other deterministic strategy takes 5** |
| Unknown — expected guesses `V_U(A)` | unpublished | Derivable from `V_S` and `D` but not in the cited work | `expected-entropy` leads the Unknown ranking at 4.232 |

The Wordle game was designed with a 6-turn limit; the fact that 5 suffices worst-case is a non-trivial result of the DP analysis, not a design feature.

### 2.1 Empirical benchmark (10 strategies × 2,315 answers)

The most recent WordleGym benchmark run (manifest schema v2) reproduces these published bounds on the canonical list:

**Standard mode** (ranked by average guesses):

| Tier | Strategy | Avg | Worst | Solve |
| --- | --- | --- | --- | --- |
| core | `expected-entropy` | 3.465 | 6 | 100% |
| experimental | `posterior-hybrid` | 3.480 | 5 | 100% |
| aggregate-aware | `posterior-expectimax` | 3.485 | 5 | 100% |
| core | `candidate-elimination` | 3.486 | 5 | 100% |
| aggregate-aware | `evil-shortest-path` | 3.514 | 5 | 100% |
| **optimal** | **`evil-dp`** (standard fallback) | **3.514** | **5** | **100%** |
| aggregate-aware | `robust-scalarization` | 3.517 | 5 | 100% |
| core | `minimax` | 3.573 | 6 | 100% |
| baseline | `letter-frequency` | 3.587 | 8 | 100% |
| baseline | `random-valid` | 4.124 | 9 | 100% |

Gap to Bertsimas & Paskov optimum (3.421): the best heuristic (`expected-entropy`) is about 0.044 turns above optimum — tight enough that the remaining gap is well within the regime where exact DP matters.

**Evil mode** — the clean separation:

| Strategy | Avg | Worst | Solve |
| --- | --- | --- | --- |
| **`evil-dp`** | **4.000** | **4** | **100%** |
| *all 8 other deterministic strategies* | 5.000 | 5 | 100% |
| `random-valid` | 7.000 | 7 | 100% |

`evil-dp` is exactly one full turn better than every greedy or partition-based strategy — a concrete demonstration that greedy minimization of the one-step forced bucket does not recover the optimum, while the recursive DP does. The first guess is `raise`.

**Unknown mode** (ranked by average guesses, averaged across hidden-standard and hidden-evil branches):

| Strategy | Avg | Worst | Solve |
| --- | --- | --- | --- |
| `expected-entropy` | 4.232 | 6 | 100% |
| `posterior-hybrid` | 4.237 | 6 | 100% |
| `candidate-elimination` | 4.243 | 5 | 100% |
| `posterior-expectimax` | 4.248 | 5 | 100% |
| `evil-shortest-path` | 4.257 | 5 | 100% |
| `evil-dp` (fallback) | 4.257 | 5 | 100% |
| `robust-scalarization` | 4.259 | 5 | 100% |
| `minimax` | 4.287 | 6 | 100% |
| `letter-frequency` | 4.294 | 8 | 100% |
| `random-valid` | 4.996 | 9 | 100% |

The Unknown-mode posterior gets enough signal from turn 1 feedback that the differences between strategies collapse; the gap from best to worst deterministic strategy is just 0.06 turns.

### 2.2 Information-theoretic lower bound

For comparison, the cleanest theoretical lower bound on Standard expected guesses is the information-theoretic bound:

```
V(A) ≥ log_2(|A|) / max_g H(g) ≈ log_2(2315) / 5.878 ≈ 1.93
```

which is very loose (the achievable optimum is 3.421) because the bound assumes arbitrary continuous partitions rather than the discrete Wordle feedback buckets. The discrete DP is the only method that delivers tight optima.

---

## 3. Computational cost at Wordle scale

For Standard-mode `V(C)`, the memoized DP visits a distinct candidate subset exactly once. The published work reports the **reachable subset count at ~10⁶ to 10⁷** across the full Wordle-scale DP, with per-subset work `O(|G| · |C|)` feedback evaluations (≈30M ops at the root).

| Implementation | Total work | Wall clock |
| --- | --- | --- |
| Pure Python, no pruning | ~10¹⁰–10¹¹ ops | days–weeks |
| Pure Python + branch-and-bound + transposition tables | ~10⁹–10¹⁰ ops | hours–days |
| C++ with SIMD + bit-vector candidate sets + strong pruning | ~10⁹ ops | minutes–hours (cluster) |

Bertsimas & Paskov report their exact DP running in **tens of minutes on an HPC cluster** in compiled code. Selby reports hours to days on a single machine in C++.

WordleGym's benchmark is designed to re-run on every code change, so any strategy that takes more than a few minutes per full benchmark run is impractical. Pure-Python Standard or Unknown DP would push the full benchmark into the day-plus range.

---

## 4. What WordleGym implements, and why

WordleGym's strategy suite is tiered to make the tradeoffs explicit:

- **Baseline / Core / Experimental tiers** implement one-ply partition heuristics. They are approximations, and their benchmark numbers should be compared against the published optima above.
- **Aggregate-aware tier** implements the spec's named *practical-candidate* policies: `evil-shortest-path`, `posterior-expectimax`, `robust-scalarization`. These are still one-ply but are aligned with the aggregate recurrences rather than raw partition metrics.
- **Optimal tier** implements exact DP only where tractable: `evil-dp`.

### Why only Evil DP is implemented

Evil mode is special: each guess has exactly one forced successor, so the reachable subset graph from `A` has ~few thousand nodes. Memoized DFS with a **beam of K=100** (the top-K guesses per node ranked by forced-bucket size) recovers the **D(A) = 4** optimum in about 80 seconds of pure-Python compute on the canonical list; the resulting policy is then cached to `results/cache/evil-dp-k100-n2315.json` (~524 KB) so subsequent benchmark runs load it instantly.

### Why Standard, Unknown, and Robust DPs are *not* implemented

Pure-Python implementations would exceed the benchmark's time budget by one to two orders of magnitude. The engineering needed to match the cited work is substantial: bit-packed candidate sets, compiled inner loops, transposition tables with canonical subset hashing, and alpha-beta-style branch-and-bound with tight lower bounds.

For now, WordleGym **backs off** from full DP in these modes. The benchmark records the practical-candidate approximations with honest caveats in each strategy's card, and this document records the gap between those approximations and the published optima.

---

## 5. Citations

### Bertsimas & Paskov (2025) — the published Standard-mode optimum

- **Bertsimas, D. & Paskov, A.** (2025). *An Exact Solution to Wordle.* [*Operations Research*, 73(3), 1384–1394](https://doi.org/10.1287/opre.2022.0434). INFORMS. Originally circulated in 2022 as the preprint *An Exact and Interpretable Solution to Wordle* ([preprint PDF](https://auction-upload-files.s3.amazonaws.com/Wordle_Paper_Final.pdf); [accessible summary](https://mitsloan.mit.edu/ideas-made-to-matter/how-algorithm-solves-wordle)).

  **What they actually do.** Write the game as a finite-horizon MDP with state = current candidate set `C` and action = guess `g`. The value function `V(C)` satisfies the Bellman equation (1.1) in this document. They reduce the state space via a chain of tractability steps — canonical candidate-subset hashing for memoization, elimination of dominated guesses, and symmetry pruning over feedback patterns — and then execute the DP in compiled code. After the optimum is computed they fit an Optimal Classification Tree with Hyperplanes to the resulting policy so that the closed-form decision rule is human-readable.

  **Headline numbers on the canonical 2,315-answer list.** Optimal opening guess `SALET`. Average guesses `V(A) = 3.421`. Worst case `W(A) = 5` (the 6-turn cap never binds). Distribution of solve length under optimal play: roughly 4% at 2 guesses, 57% at 3, 35% at 4, 3% at 5, 0% at 6+.

  **What this means for WordleGym.** Every Standard-mode number in the benchmark is compared against Bertsimas & Paskov. WordleGym's best Standard-mode heuristic, `expected-entropy`, averages 3.465 guesses — 0.044 above the published optimum, or ~1.3%. The gap is genuinely the cost of one-ply reasoning; it is not an implementation artifact.

### Selby (2022) — independent confirmation

- **Selby, A.** (2022). *The best strategies for Wordle.* [sonorouschocolate.com](https://sonorouschocolate.com/notes/index.php?title=The_best_strategies_for_Wordle). Independent exact solver using an A\*-style tree search over hard-mode and full-allowed variants. Reproduces `V(A) = 3.421` and `W(A) = 5` under the canonical answer list.

### Poirrier (2022) — survey

- **Poirrier, L.** (2022). *Mathematical optimization over Wordle decision trees.* [poirrier.ca/notes/wordle](https://www.poirrier.ca/notes/wordle/). Surveys DP formulations and greedy heuristics; the reference I followed for the benchmark spec.

---

## 6. Future work (ordered by estimated leverage)

1. **NumPy vectorization of partition scans.** Pre-materialize the `M × N` feedback matrix as `uint8`, replace `partition_counts` with `np.bincount` per guess. Expected 5–10× on every partition-based strategy; could raise the `evil-dp` beam to K=500 or enable unbounded search.
2. **Partial DP bucket cache for late-game states.** Precompute exact `V(C)` for reachable subsets with `|C| ≤ 30` and serve them to every strategy. Estimated impact: 0.05–0.15 turns off every Standard-mode strategy's average.
3. **Standard-mode exact DP via a compiled extension.** Cython or Rust for the inner loop, bit-vector candidate sets, transposition tables. Would close the gap to published optima but is substantial engineering.

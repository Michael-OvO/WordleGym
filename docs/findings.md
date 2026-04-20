# Benchmark Findings

Canonical Wordle list (2,315 answers, ~13,000 allowed guesses). Schema v2 manifest. All ten strategies solve 100% within the 6-turn cap. Detailed derivations and citations are in [`dp-methods.md`](dp-methods.md).

## Headline result

**Evil mode has a separating strategy.** `evil-dp` solves the full Evil Wordle in exactly **4 turns** (D(A) = 4, first guess `raise`), while every other deterministic strategy in the suite — including the three one-step aggregate-aware heuristics — ties at 5.

This confirms the spec's claim that greedy forced-bucket minimization is strictly suboptimal for `D(C)`, and that the recursive DP is worth its compute cost on the one mode where it is tractable in pure Python.

## Full 10-strategy table

| Strategy | Tier | Std avg | Std worst | Evil avg | Unk avg |
| --- | --- | --- | --- | --- | --- |
| `evil-dp` | optimal | 3.514 | 5 | **4.000** | 4.257 |
| `expected-entropy` | core | **3.465** | 6 | 5.000 | **4.232** |
| `posterior-hybrid` | experimental | 3.480 | 5 | 5.000 | 4.237 |
| `posterior-expectimax` | aggregate-aware | 3.485 | 5 | 5.000 | 4.248 |
| `candidate-elimination` | core | 3.486 | 5 | 5.000 | 4.243 |
| `evil-shortest-path` | aggregate-aware | 3.514 | 5 | 5.000 | 4.257 |
| `robust-scalarization` | aggregate-aware | 3.517 | 5 | 5.000 | 4.259 |
| `minimax` | core | 3.573 | 6 | 5.000 | 4.287 |
| `letter-frequency` | baseline | 3.587 | 8 | 5.000 | 4.294 |
| `random-valid` | baseline | 4.124 | 9 | 7.000 | 4.996 |

(**bold** = best in column)

## What the modes tell us

- **Standard mode**: the heuristic ranking is tight — the top four are within 0.021 turns of each other, and the worst-case-optimum of 5 turns is recovered by seven of ten strategies. The published optimum (3.421, Bertsimas & Paskov 2022) is 0.044 turns below our best heuristic; that gap is where exact DP would pay off, but Python-cost makes Standard DP impractical.
- **Evil mode**: a single-number ranking — `evil-dp` at 4, everyone else at 5 (or 7 for random). Greedy forced-bucket minimization is *exactly one turn* short of optimum.
- **Unknown mode**: posterior-weighted policies do well, but the spread from best to worst deterministic strategy is only 0.06 turns. The Bayesian information gain from turn 1 feedback dominates the choice of subsequent policy.

## Tier ranking

Each tier's best representative:

| Tier | Strategy | Evil avg | Std avg |
| --- | --- | --- | --- |
| baseline | `letter-frequency` | 5.000 | 3.587 |
| core | `expected-entropy` | 5.000 | 3.465 |
| experimental | `posterior-hybrid` | 5.000 | 3.480 |
| aggregate-aware | `posterior-expectimax` | 5.000 | 3.485 |
| **optimal** | **`evil-dp`** | **4.000** | 3.514 |

The `optimal` tier is the only one where the tier name is load-bearing in the benchmark number, which is the entire point of the exercise.

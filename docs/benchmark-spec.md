# WordleGym Benchmark Spec

## Corpus

- Canonical answers: `data/wordle-answers.txt`
- Allowed guesses: `data/wordle-allowed-guesses.txt`
- Interactive validation uses the full allowed set plus canonical answers.
- Solver search evaluates over the canonical answer pool for reproducibility and runtime control.

## Modes

### Standard

The hidden answer is fixed at reset and feedback follows canonical Wordle scoring.

### Evil

After each guess, the environment chooses the feedback partition that leaves the largest feasible answer set. Ties are broken by:

1. fewer greens
2. fewer yellows
3. lexicographically smaller feedback pattern

### Unknown

At reset the environment samples a hidden mode from `{standard, evil}` using prior `P(standard)=P(evil)=0.5`. The player observes only feedback and must update a posterior over modes.

## Metrics

- average guesses
- worst-case guesses
- solve rate
- penalized average guesses
- remaining-candidate trajectory
- unknown-mode posterior calibration
- mode-detection accuracy by turn
- robustness under model mismatch

The benchmark summaries report solve depth: the number of turns taken until
the strategy reaches an all-green terminal state. The runner uses a 12-turn
runaway safeguard for automated evaluation. This is intentionally different
from the six-turn Wordle user-interface cap, because letting weak baselines
finish makes their relative failure modes visible.

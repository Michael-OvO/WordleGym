# WordleGym

WordleGym is a research playground for studying Wordle strategy under standard, adversarial, and hidden-mode settings.

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

## Notes

- Benchmarks use the official Wordle answer list and allowed-guess list.
- Solver policies evaluate over the canonical answer pool for tractability, while interactive play validates guesses against the full allowed list.


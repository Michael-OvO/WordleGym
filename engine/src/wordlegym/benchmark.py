from __future__ import annotations

import gzip
import json
import logging
import shutil
from collections import defaultdict
from dataclasses import asdict
from pathlib import Path
from statistics import mean
from typing import Iterable

from .corpus import WordCorpus
from .environments import EvilEnvironment, GameConfig, StandardEnvironment, UnknownEnvironment
from .feedback import pattern_to_emoji, pattern_to_text, score_guess
from .trace import GameTrace, GuessTraceStep
from .registry import STRATEGY_REGISTRY, build_strategies
from .strategy import StrategyBase

logger = logging.getLogger(__name__)


class BenchmarkRunner:
    def __init__(
        self,
        repo_root: Path,
        *,
        corpus: WordCorpus | None = None,
        strategies: dict[str, StrategyBase] | None = None,
    ) -> None:
        self.repo_root = repo_root
        self.corpus = corpus or WordCorpus.from_repo_root(repo_root)
        self.strategies = strategies or build_strategies(self.corpus)

    def run(self) -> dict[str, object]:
        logger.info("Starting benchmark: %d strategies, %d answers", len(self.strategies), len(self.corpus.answers))
        traces: dict[str, list[GameTrace]] = {
            "standard": self._run_standard(),
            "evil": self._run_evil(),
            "unknown": self._run_unknown(),
        }
        summaries = self._build_summaries(traces)
        robustness = self._build_robustness_matrix(summaries)
        decision_snapshots = self._decision_tree_snapshots()
        replays = self._sample_replays(traces)
        manifest = {
            "schema_version": 2,
            "answers": len(self.corpus.answers),
            "allowed_guesses": len(self.corpus.allowed_set),
            "strategies": [
                {
                    "id": strategy_id,
                    "label": meta.label,
                    "objective": meta.objective,
                    "tier": meta.tier,
                    "caveat": meta.caveat,
                }
                for strategy_id, meta in STRATEGY_REGISTRY.items()
            ],
        }
        return {
            "manifest": manifest,
            "summaries": summaries,
            "robustness": robustness,
            "decision_snapshots": decision_snapshots,
            "replays": replays,
            "traces": traces,
        }

    def write_outputs(self) -> dict[str, object]:
        payload = self.run()
        raw_dir = self.repo_root / "results" / "raw"
        web_dir = self.repo_root / "results" / "web"
        raw_dir.mkdir(parents=True, exist_ok=True)
        web_dir.mkdir(parents=True, exist_ok=True)

        for mode, traces in payload["traces"].items():
            output_path = raw_dir / f"{mode}.jsonl.gz"
            with gzip.open(output_path, "wt", encoding="utf-8") as handle:
                for trace in traces:
                    handle.write(json.dumps(trace.to_dict(), sort_keys=True))
                    handle.write("\n")

        web_payload = {
            "manifest": payload["manifest"],
            "summaries": payload["summaries"],
            "robustness": payload["robustness"],
            "decision_snapshots": payload["decision_snapshots"],
            "replays": payload["replays"],
        }
        for filename, content in (
            ("manifest.json", payload["manifest"]),
            ("summaries.json", payload["summaries"]),
            ("robustness.json", payload["robustness"]),
            ("decision-snapshots.json", payload["decision_snapshots"]),
            ("sample-replays.json", payload["replays"]),
        ):
            (web_dir / filename).write_text(json.dumps(content, indent=2, sort_keys=True))

        parity_fixtures = self._parity_fixtures()
        (web_dir / "parity-fixtures.json").write_text(json.dumps(parity_fixtures, indent=2, sort_keys=True))
        self._sync_web_assets()
        return web_payload

    def sync_web_data(self) -> None:
        self._sync_web_assets()

    def _run_standard(self) -> list[GameTrace]:
        traces: list[GameTrace] = []
        for strategy_idx, strategy in enumerate(self.strategies.values()):
            logger.info("Standard mode: strategy %d/%d (%s)", strategy_idx + 1, len(self.strategies), strategy.id)
            for answer_idx, answer in enumerate(self.corpus.answers):
                env = StandardEnvironment(self.corpus)
                env.reset(GameConfig(hidden_answer=answer))
                traces.append(self._play_game(strategy, env, branch="standard", hidden_answer=answer, hidden_mode="standard"))
        return traces

    def _run_evil(self) -> list[GameTrace]:
        traces: list[GameTrace] = []
        for strategy_idx, strategy in enumerate(self.strategies.values()):
            logger.info("Evil mode: strategy %d/%d (%s)", strategy_idx + 1, len(self.strategies), strategy.id)
            env = EvilEnvironment(self.corpus)
            env.reset(GameConfig())
            traces.append(self._play_game(strategy, env, branch="evil", hidden_answer=None, hidden_mode="evil"))
        return traces

    def _run_unknown(self) -> list[GameTrace]:
        traces: list[GameTrace] = []
        for strategy_idx, strategy in enumerate(self.strategies.values()):
            logger.info("Unknown mode: strategy %d/%d (%s)", strategy_idx + 1, len(self.strategies), strategy.id)
            for answer_idx, answer in enumerate(self.corpus.answers):
                env = UnknownEnvironment(self.corpus)
                env.reset(GameConfig(hidden_mode="standard", hidden_answer=answer, mode_prior=0.5, seed=11))
                traces.append(self._play_game(strategy, env, branch="unknown-standard", hidden_answer=answer, hidden_mode="standard"))
            env = UnknownEnvironment(self.corpus)
            env.reset(GameConfig(hidden_mode="evil", mode_prior=0.5, seed=11))
            traces.append(self._play_game(strategy, env, branch="unknown-evil", hidden_answer=None, hidden_mode="evil"))
        return traces

    def _play_game(
        self,
        strategy: StrategyBase,
        env: StandardEnvironment | EvilEnvironment | UnknownEnvironment,
        *,
        branch: str,
        hidden_answer: str | None,
        hidden_mode: str | None,
    ) -> GameTrace:
        steps: list[GuessTraceStep] = []
        safeguard = 12
        while not env.is_terminal() and len(env.guesses) < safeguard:
            snapshot = env.snapshot()
            decision = strategy.choose_guess(snapshot)
            pattern = env.apply_guess(decision.guess)
            updated_snapshot = env.snapshot()
            mode_posterior = (
                updated_snapshot.mode_posterior.to_dict() if updated_snapshot.mode_posterior is not None else None
            )
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
        snapshot = env.snapshot()
        return GameTrace(
            mode=env.mode,
            branch=branch,
            strategy_id=strategy.id,
            hidden_answer=hidden_answer,
            hidden_mode=hidden_mode,
            turns=len(steps),
            solved=snapshot.solved,
            exhausted=snapshot.exhausted,
            remaining_candidates=len(snapshot.candidates),
            steps=tuple(steps),
        )

    def _build_summaries(self, traces: dict[str, list[GameTrace]]) -> dict[str, object]:
        summary: dict[str, object] = {}
        for mode, mode_traces in traces.items():
            grouped: dict[str, list[GameTrace]] = defaultdict(list)
            for trace in mode_traces:
                grouped[trace.strategy_id].append(trace)

            strategy_rows = []
            for strategy_id, strategy_traces in grouped.items():
                turns = [trace.turns for trace in strategy_traces]
                worst_case = max(turns, default=0)

                if mode == "unknown":
                    standard_traces = [trace for trace in strategy_traces if trace.hidden_mode == "standard"]
                    evil_traces = [trace for trace in strategy_traces if trace.hidden_mode == "evil"]
                    standard_average = mean(trace.turns for trace in standard_traces)
                    evil_average = mean(trace.turns for trace in evil_traces)
                    average_guesses = (standard_average + evil_average) / 2

                    standard_penalized = mean(
                        trace.turns if trace.solved else trace.turns + 1 for trace in standard_traces
                    )
                    evil_penalized = mean(
                        trace.turns if trace.solved else trace.turns + 1 for trace in evil_traces
                    )
                    penalized_average = (standard_penalized + evil_penalized) / 2
                    solve_rate = (
                        (sum(1 for trace in standard_traces if trace.solved) / len(standard_traces))
                        + (sum(1 for trace in evil_traces if trace.solved) / len(evil_traces))
                    ) / 2
                    solved_turns = [
                        *[trace.turns for trace in standard_traces if trace.solved],
                        *[trace.turns for trace in evil_traces if trace.solved],
                    ]
                else:
                    average_guesses = mean(turns)
                    solved_turns = [trace.turns for trace in strategy_traces if trace.solved]
                    solve_rate = sum(1 for trace in strategy_traces if trace.solved) / len(strategy_traces)
                    penalized_average = mean(
                        trace.turns if trace.solved else trace.turns + 1 for trace in strategy_traces
                    )

                row = {
                    "strategy_id": strategy_id,
                    "label": STRATEGY_REGISTRY[strategy_id][1],
                    "objective": STRATEGY_REGISTRY[strategy_id][2],
                    "games": len(strategy_traces),
                    "average_guesses": round(average_guesses, 6),
                    "average_guesses_on_solve": round(mean(solved_turns), 6) if solved_turns else None,
                    "solve_rate": round(solve_rate, 6),
                    "worst_case": worst_case,
                    "penalized_average_guesses": round(penalized_average, 6),
                }
                if mode == "unknown":
                    row["posterior_accuracy_by_turn"] = self._posterior_accuracy(strategy_traces)
                strategy_rows.append(row)
            summary[mode] = sorted(strategy_rows, key=lambda row: row["penalized_average_guesses"])
        return summary

    def _posterior_accuracy(self, traces: Iterable[GameTrace]) -> list[dict[str, float]]:
        totals: dict[int, dict[str, list[float]]] = defaultdict(lambda: {"standard": [], "evil": []})
        for trace in traces:
            target_key = "evil" if trace.hidden_mode == "evil" else "standard"
            for step in trace.steps:
                if step.mode_posterior is None:
                    continue
                totals[step.turn][trace.hidden_mode or "standard"].append(step.mode_posterior[target_key])
        return [
            {
                "turn": turn,
                "mean_true_mode_posterior": round(
                    (
                        mean(values["standard"]) if values["standard"] else 0
                    ) / 2
                    + (
                        mean(values["evil"]) if values["evil"] else 0
                    ) / 2,
                    6,
                ),
            }
            for turn, values in sorted(totals.items())
        ]

    def _build_robustness_matrix(self, summaries: dict[str, object]) -> dict[str, object]:
        matrix: dict[str, dict[str, float]] = {}
        for mode, rows in summaries.items():
            for row in rows:
                matrix.setdefault(row["strategy_id"], {})[mode] = row["penalized_average_guesses"]
        mismatch = []
        for strategy_id, scores in matrix.items():
            mismatch.append(
                {
                    "strategy_id": strategy_id,
                    "standard": scores.get("standard"),
                    "evil": scores.get("evil"),
                    "unknown": scores.get("unknown"),
                    "spread": round(max(scores.values()) - min(scores.values()), 6),
                }
            )
        return {"matrix": matrix, "mismatch_spread": sorted(mismatch, key=lambda row: row["spread"])}

    def _decision_tree_snapshots(self) -> list[dict[str, object]]:
        snapshots = []
        initial_candidates = self.corpus.answers
        table = next(iter(self.strategies.values())).table
        # Snapshot both the Standard-best heuristics and the Evil-DP optimum,
        # so the web ResultsExplorer can contrast partition shapes across tiers.
        specs = (
            ("standard", "expected-entropy", StandardEnvironment),
            ("standard", "minimax", StandardEnvironment),
            ("standard", "posterior-hybrid", StandardEnvironment),
            ("evil", "evil-dp", EvilEnvironment),
        )
        for mode, strategy_id, env_cls in specs:
            if strategy_id not in self.strategies:
                continue
            strategy = self.strategies[strategy_id]
            first_guess = strategy.choose_guess(env_cls(self.corpus).snapshot()).guess
            counts = table.partition_counts(first_guess, initial_candidates)
            top_partitions = sorted(counts.items(), key=lambda item: item[1], reverse=True)[:8]
            snapshots.append(
                {
                    "mode": mode,
                    "strategy_id": strategy_id,
                    "first_guess": first_guess,
                    "top_partitions": [
                        {"pattern": pattern, "pattern_text": pattern_to_text(pattern), "size": size}
                        for pattern, size in top_partitions
                    ],
                }
            )
        return snapshots

    def _sample_replays(self, traces: dict[str, list[GameTrace]]) -> dict[str, object]:
        samples: dict[str, object] = {}
        for mode, mode_traces in traces.items():
            grouped: dict[str, list[GameTrace]] = defaultdict(list)
            for trace in mode_traces:
                grouped[trace.strategy_id].append(trace)
            samples[mode] = {}
            for strategy_id, strategy_traces in grouped.items():
                chosen = strategy_traces[0]
                if mode == "standard":
                    candidates = [trace for trace in strategy_traces if trace.hidden_answer in {"cigar", "rebut", "sissy"}]
                    if candidates:
                        chosen = candidates[0]
                samples[mode][strategy_id] = chosen.to_dict()
        return samples

    def _parity_fixtures(self) -> dict[str, object]:
        toy_answers = ("cigar", "rebut", "sissy", "humph")
        array_pattern = score_guess("array", "cairn")
        sissy_pattern = score_guess("sissy", "missy")
        standard_pattern = score_guess("cigar", "rebut")
        fixtures = {
            "score_cases": [
                {
                    "guess": "cigar",
                    "answer": "cigar",
                    "pattern": 242,
                    "pattern_text": "GGGGG",
                },
                {
                    "guess": "array",
                    "answer": "cairn",
                    "pattern": array_pattern,
                    "pattern_text": pattern_to_text(array_pattern),
                },
                {
                    "guess": "sissy",
                    "answer": "missy",
                    "pattern": sissy_pattern,
                    "pattern_text": pattern_to_text(sissy_pattern),
                },
            ],
            "toy_answers": toy_answers,
            "standard_filter_case": {
                "guess": "cigar",
                "answer": "rebut",
                "pattern": standard_pattern,
                "pattern_text": pattern_to_text(standard_pattern),
                "remaining": [
                    word for word in toy_answers if score_guess("cigar", word) == standard_pattern
                ],
            },
        }
        return fixtures

    def _sync_web_assets(self) -> None:
        public_dir = self.repo_root / "apps" / "web" / "public" / "generated"
        public_dir.mkdir(parents=True, exist_ok=True)
        for filename in ("manifest.json", "summaries.json", "robustness.json", "decision-snapshots.json", "sample-replays.json", "parity-fixtures.json"):
            shutil.copy2(self.repo_root / "results" / "web" / filename, public_dir / filename)

        word_dir = public_dir / "wordlists"
        word_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(self.repo_root / "data" / "wordle-answers.txt", word_dir / "answers.txt")
        shutil.copy2(self.repo_root / "data" / "wordle-allowed-guesses.txt", word_dir / "allowed.txt")

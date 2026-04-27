"""Emit per-turn ranked-candidate data for the web Simulator.

Produces ``results/web/simulator.json`` (and mirrors it into the Next
``public/generated`` tree) containing, for one or more curated cases,
every strategy's full top-K ranking at every turn of the game.

Schema (one entry per case)::

    {
      "schema_version": 1,
      "cases": [
        {
          "case_id": "aback-unknown",
          "label": "ABACK · Unknown mode",
          "hidden_answer": "aback",
          "mode": "unknown",
          "hidden_mode": "standard",
          "total_candidates": 2315,
          "strategies": [
            {
              "strategy_id": "expected-entropy",
              "label": "Expected Entropy",
              "tier": "core",
              "metric": {"label": "entropy", "unit": "bits", "decimals": 3, "goal": "max"},
              "turns": [
                {
                  "turn": 1,
                  "candidates_before": 2315,
                  "candidates_after": 40,
                  "pool_preview": ["abase", "abate", ...],
                  "chosen": "soare",
                  "chosen_pattern": "BBGBB",
                  "chosen_score": 5.886,
                  "top_candidates": [
                    {"rank": 1, "guess": "soare", "score": 5.886, "is_chosen": true,
                     "is_in_pool": false, "extras": {...}},
                    ...
                  ]
                },
                ...
              ]
            },
            ...
          ]
        },
        ...
      ]
    }

Top-K ranks every allowed guess by the strategy's local objective (top
``TOP_K`` returned + the chosen guess if it wasn't already in top-K).
For ``random-valid`` we surface the hash-derived pick only -- no real
ranking exists.

Usage::

    cd engine
    uv run python scripts/emit_simulator.py
"""

from __future__ import annotations

import json
import math
import sys
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENGINE_SRC = HERE.parent / "src"
if str(ENGINE_SRC) not in sys.path:
    sys.path.insert(0, str(ENGINE_SRC))

from wordlegym.analysis import FeedbackTable
from wordlegym.corpus import WordCorpus
from wordlegym.feedback import encode_pattern, pattern_to_text, score_guess
from wordlegym.metrics import (
    evil_forced_bucket_size,
    expected_remaining,
    reduction_ratio,
    shannon_entropy,
    worst_case_bucket,
)

REPO_ROOT = HERE.parent.parent
TOP_K = 8

# ─── Strategy metric definitions ───────────────────────────────────────
# Each entry is (label, unit, decimals, goal) — purely display metadata.
STRATEGY_METRICS: dict[str, dict] = {
    "expected-entropy":     {"label": "entropy",      "unit": "bits",        "decimals": 3, "goal": "max"},
    "candidate-elimination":{"label": "E[remaining]", "unit": None,          "decimals": 2, "goal": "min"},
    "minimax":              {"label": "worst bucket", "unit": None,          "decimals": 0, "goal": "min"},
    "evil-shortest-path":   {"label": "|T|",          "unit": None,          "decimals": 0, "goal": "min"},
    "evil-dp":              {"label": "|T| (greedy)", "unit": None,          "decimals": 0, "goal": "min"},
    "letter-frequency":     {"label": "letter score", "unit": None,          "decimals": 0, "goal": "max"},
    "posterior-hybrid":     {"label": "blended",      "unit": None,          "decimals": 3, "goal": "max"},
    "posterior-expectimax": {"label": "q·E[rem]+(1-q)·|T|", "unit": None,    "decimals": 2, "goal": "min"},
    "robust-scalarization": {"label": "max(E[rem],|T|)", "unit": None,       "decimals": 2, "goal": "min"},
    "random-valid":         {"label": "hash-seeded",  "unit": None,          "decimals": 0, "goal": "max"},
}

STRATEGY_TIERS: dict[str, str] = {
    "expected-entropy": "core",
    "candidate-elimination": "core",
    "minimax": "core",
    "posterior-hybrid": "experimental",
    "evil-shortest-path": "aggregate-aware",
    "posterior-expectimax": "aggregate-aware",
    "robust-scalarization": "aggregate-aware",
    "evil-dp": "optimal",
    "letter-frequency": "baseline",
    "random-valid": "baseline",
}

STRATEGY_LABELS: dict[str, str] = {
    "expected-entropy": "Expected Entropy",
    "candidate-elimination": "Candidate Elimination",
    "minimax": "Minimax",
    "posterior-hybrid": "Posterior Hybrid",
    "posterior-expectimax": "Posterior Expectimax",
    "robust-scalarization": "Robust Scalarization",
    "evil-shortest-path": "Evil Shortest Path",
    "evil-dp": "Evil DP",
    "letter-frequency": "Letter Frequency",
    "random-valid": "Random Valid",
}

# Display order — same as strategy-walkthroughs.ts on the web side.
STRATEGY_ORDER: list[str] = [
    "expected-entropy",
    "candidate-elimination",
    "minimax",
    "evil-dp",
    "evil-shortest-path",
    "posterior-expectimax",
    "posterior-hybrid",
    "robust-scalarization",
    "letter-frequency",
    "random-valid",
]


# ─── Per-strategy scoring functions ────────────────────────────────────
# All return ``(rank_key, display_score, extras)`` where rank_key is the
# value the strategy minimizes (lower wins) and display_score is what we
# show on the UI.
@dataclass
class GuessScore:
    rank_key: tuple
    display: float
    extras: dict[str, float | int] | None = None


def _partition_score(
    strategy_id: str,
    table: FeedbackTable,
    guess: str,
    candidates: tuple[str, ...],
    *,
    standard_pool: tuple[str, ...] | None = None,
    evil_pool: tuple[str, ...] | None = None,
    q_std: float = 1.0,
    q_evil: float = 0.0,
    candidate_set: set[str] | None = None,
    positional_freq: list[Counter] | None = None,
    global_freq: Counter | None = None,
) -> GuessScore:
    """Score a single guess under the given strategy.

    The rank_key is what we sort on (smaller = better). The display value
    is the human-readable metric — entropy in bits, |T| as count, etc.
    """
    cs = candidate_set or set(candidates)
    in_candidate_pool = 0 if guess in cs else 1

    if strategy_id == "expected-entropy":
        counts = table.partition_counts(guess, candidates)
        h = shannon_entropy(counts)
        wc = worst_case_bucket(counts)
        # Want max entropy → rank by negative entropy ascending.
        return GuessScore(
            rank_key=(-h, wc, in_candidate_pool, guess),
            display=h,
            extras={"worst_case": wc, "expected_remaining": round(expected_remaining(counts), 3)},
        )

    if strategy_id == "candidate-elimination":
        counts = table.partition_counts(guess, candidates)
        e = expected_remaining(counts)
        wc = worst_case_bucket(counts)
        return GuessScore(
            rank_key=(e, wc, in_candidate_pool, guess),
            display=e,
            extras={"worst_case": wc, "entropy": round(shannon_entropy(counts), 3)},
        )

    if strategy_id == "minimax":
        counts = table.partition_counts(guess, candidates)
        wc = worst_case_bucket(counts)
        return GuessScore(
            rank_key=(wc, in_candidate_pool, guess),
            display=float(wc),
            extras={"entropy": round(shannon_entropy(counts), 3)},
        )

    if strategy_id in ("evil-dp", "evil-shortest-path"):
        counts = table.partition_counts(guess, candidates)
        forced = evil_forced_bucket_size(counts)
        h = shannon_entropy(counts)
        return GuessScore(
            rank_key=(forced, -h, in_candidate_pool, guess),
            display=float(forced),
            extras={"entropy": round(h, 3)},
        )

    if strategy_id == "posterior-expectimax":
        counts = table.partition_counts(guess, candidates)
        e = expected_remaining(counts)
        forced = evil_forced_bucket_size(counts)
        score = q_std * e + q_evil * forced
        return GuessScore(
            rank_key=(score, in_candidate_pool, forced, guess),
            display=score,
            extras={"E[rem]": round(e, 2), "|T|": forced},
        )

    if strategy_id == "robust-scalarization":
        counts = table.partition_counts(guess, candidates)
        e = expected_remaining(counts)
        forced = evil_forced_bucket_size(counts)
        robust = max(e, float(forced))
        mean = 0.5 * (e + forced)
        return GuessScore(
            rank_key=(robust, mean, in_candidate_pool, guess),
            display=robust,
            extras={"E[rem]": round(e, 2), "|T|": forced},
        )

    if strategy_id == "posterior-hybrid":
        std_pool = standard_pool or candidates
        ev_pool = evil_pool or candidates
        std_counts = table.partition_counts(guess, std_pool)
        ev_counts = table.partition_counts(guess, ev_pool)
        h = shannon_entropy(std_counts)
        max_h = math.log2(len(std_pool)) if len(std_pool) > 1 else 1.0
        h_norm = h / max_h
        wc = worst_case_bucket(ev_counts)
        r = reduction_ratio(len(ev_pool), wc)
        blended = q_std * h_norm + q_evil * r
        return GuessScore(
            rank_key=(-blended, wc, in_candidate_pool, guess),
            display=blended,
            extras={"H_norm": round(h_norm, 3), "r_evil": round(r, 3)},
        )

    if strategy_id == "letter-frequency":
        # Letter-frequency only scores within the candidate pool.
        if guess not in cs:
            return GuessScore(rank_key=(float("inf"), guess), display=0.0, extras=None)
        pos_freq = positional_freq or [Counter(w[i] for w in candidates) for i in range(5)]
        glob = global_freq or Counter(c for w in candidates for c in set(w))
        seen: set[str] = set()
        global_score = 0
        for c in guess:
            if c not in seen:
                global_score += glob[c]
                seen.add(c)
        positional_score = sum(pos_freq[i][c] for i, c in enumerate(guess))
        score = positional_score + 0.4 * global_score
        return GuessScore(
            rank_key=(-score, guess),
            display=score,
            extras={"pos": int(positional_score), "global": int(0.4 * global_score)},
        )

    if strategy_id == "random-valid":
        # No real ranking — we'll surface a single "chosen" entry from the
        # replay; this branch should never be hit in scoring loops.
        return GuessScore(rank_key=(0, guess), display=0.0, extras=None)

    raise ValueError(f"unknown strategy_id: {strategy_id}")


def rank_top_k_for_strategy(
    strategy_id: str,
    table: FeedbackTable,
    candidates: tuple[str, ...],
    allowed: tuple[str, ...],
    chosen: str,
    *,
    standard_pool: tuple[str, ...] | None = None,
    evil_pool: tuple[str, ...] | None = None,
    q_std: float = 1.0,
    q_evil: float = 0.0,
    top_k: int = TOP_K,
) -> list[dict]:
    """Score every allowed guess for the strategy, return top-K.

    The chosen guess is always included even if it's outside the top-K.
    """
    if strategy_id == "random-valid":
        # Render only the chosen pick + a few alphabetically-following pool
        # words as "could have been picked" alternatives.
        pool_set = set(candidates)
        pool_list = sorted(candidates)
        try:
            chosen_idx = pool_list.index(chosen)
        except ValueError:
            chosen_idx = 0
        # Return chosen + up to (top_k-1) others sampled around it.
        others = [w for w in pool_list[:top_k] if w != chosen]
        keep = [chosen] + others[: top_k - 1]
        out = []
        for r, g in enumerate(keep, start=1):
            out.append({
                "rank": r,
                "guess": g,
                "score": 0.0,
                "is_chosen": g == chosen,
                "is_in_pool": g in pool_set,
                "extras": None,
            })
        return out

    candidate_set = set(candidates)
    # Pre-compute letter-frequency tables once if needed
    pos_freq = global_freq = None
    if strategy_id == "letter-frequency":
        pos_freq = [Counter(w[i] for w in candidates) for i in range(5)]
        global_freq = Counter(c for w in candidates for c in set(w))

    pool = candidates if strategy_id == "letter-frequency" else allowed

    scored: list[tuple[tuple, str, float, dict | None]] = []
    for g in pool:
        gs = _partition_score(
            strategy_id,
            table,
            g,
            candidates,
            standard_pool=standard_pool,
            evil_pool=evil_pool,
            q_std=q_std,
            q_evil=q_evil,
            candidate_set=candidate_set,
            positional_freq=pos_freq,
            global_freq=global_freq,
        )
        scored.append((gs.rank_key, g, gs.display, gs.extras))
    scored.sort(key=lambda x: x[0])
    selected = scored[:top_k]
    chosen_entry = next((s for s in scored if s[1] == chosen), None)
    if chosen_entry and chosen_entry not in selected:
        selected.append(chosen_entry)

    out = []
    for r, (_key, g, display, extras) in enumerate(selected, start=1):
        out.append({
            "rank": r,
            "guess": g,
            "score": round(float(display), 4),
            "is_chosen": g == chosen,
            "is_in_pool": g in candidate_set,
            "extras": extras,
        })
    # Re-rank by display value within the goal direction so the UI can
    # render in score order. Chosen guess keeps its tag regardless.
    return out


# ─── Per-strategy game replay & top-K ───────────────────────────────────
def simulate_strategy_case(
    strategy_id: str,
    table: FeedbackTable,
    answers: tuple[str, ...],
    allowed: tuple[str, ...],
    replay_steps: list[dict],
    hidden_answer: str,
    mode: str,
    top_k: int = TOP_K,
) -> list[dict]:
    """Simulate one strategy's game and emit per-turn rankings.

    Walks through the strategy's recorded chosen guesses (from the
    benchmark replay), reconstructing the candidate pool entering each
    turn. For mode-aware strategies in unknown mode, the standard and
    evil pools and the posterior are also tracked.
    """
    standard_pool: tuple[str, ...] = answers
    evil_pool: tuple[str, ...] = answers
    candidate_pool: tuple[str, ...] = answers

    turns: list[dict] = []
    for step in replay_steps:
        chosen = step["guess"]
        feedback_int = step["pattern"]
        feedback_text = step["pattern_text"]
        posterior = step.get("mode_posterior") or {"standard": 1.0, "evil": 0.0}
        q_std = float(posterior.get("standard", 1.0))
        q_evil = float(posterior.get("evil", 0.0))

        # Decide which pool the strategy is reasoning about for top-K.
        # Most strategies use a single "candidate pool" derived from
        # observed feedback. Mode-aware strategies in unknown mode use the
        # union of std + evil so they consider every still-plausible word.
        if mode == "unknown" and strategy_id in (
            "posterior-hybrid", "posterior-expectimax",
            "robust-scalarization", "evil-dp", "evil-shortest-path",
        ):
            score_candidates = tuple(sorted(set(standard_pool) | set(evil_pool)))
        else:
            score_candidates = candidate_pool

        # Pool preview: first 12 alphabetically.
        pool_preview = list(sorted(score_candidates)[:12])

        # Top-K scoring.
        t0 = time.time()
        top = rank_top_k_for_strategy(
            strategy_id, table, score_candidates, allowed, chosen,
            standard_pool=standard_pool,
            evil_pool=evil_pool,
            q_std=q_std,
            q_evil=q_evil,
            top_k=top_k,
        )
        elapsed = time.time() - t0

        chosen_score_entry = next((c for c in top if c["is_chosen"]), None)
        chosen_score = chosen_score_entry["score"] if chosen_score_entry else None

        # Apply the actual observed feedback to advance the pools.
        next_standard = tuple(
            a for a in standard_pool if score_guess(chosen, a) == feedback_int
        )
        # In unknown mode the evil_pool is filtered to words for which the
        # evil-forced pattern equals the observed feedback. For simplicity
        # in this educational simulator we filter both by feedback; the
        # benchmark's tracking is more nuanced but this is good enough for
        # visualization.
        next_evil = tuple(
            a for a in evil_pool if score_guess(chosen, a) == feedback_int
        )
        next_candidate_pool = tuple(
            a for a in candidate_pool if score_guess(chosen, a) == feedback_int
        )

        candidates_after = step.get("remaining_candidates", len(next_candidate_pool))

        turns.append({
            "turn": step["turn"],
            "candidates_before": len(score_candidates),
            "candidates_after": int(candidates_after),
            "pool_preview": pool_preview,
            "posterior": {"standard": round(q_std, 4), "evil": round(q_evil, 4)},
            "chosen": chosen,
            "chosen_pattern": feedback_text,
            "chosen_score": chosen_score,
            "top_candidates": top,
        })

        standard_pool = next_standard
        evil_pool = next_evil
        candidate_pool = next_candidate_pool

        print(
            f"[simulator]   {strategy_id:24s} t={step['turn']} "
            f"|C|={len(score_candidates):4d} ranked in {elapsed:4.1f}s "
            f"(chose {chosen!r})"
        )

    return turns


# ─── Aggregate stats ───────────────────────────────────────────────────
def compute_aggregate_stats(strategies_data: list[dict]) -> dict:
    """Cross-strategy summary stats for the case."""
    solve_depths = [len(s["turns"]) for s in strategies_data]

    # Pool decay: at each turn, the per-strategy candidates_before count.
    max_turns = max(solve_depths)
    pool_decay: list[dict] = []
    for t in range(1, max_turns + 1):
        per_strategy = []
        for s in strategies_data:
            tturn = next((x for x in s["turns"] if x["turn"] == t), None)
            if tturn is None:
                continue
            per_strategy.append({
                "strategy_id": s["strategy_id"],
                "candidates_before": tturn["candidates_before"],
                "candidates_after": tturn["candidates_after"],
            })
        pool_decay.append({"turn": t, "rows": per_strategy})

    # Per-turn agreement: how many distinct guesses chosen at each turn.
    agreement: list[dict] = []
    for t in range(1, max_turns + 1):
        guesses = []
        for s in strategies_data:
            tturn = next((x for x in s["turns"] if x["turn"] == t), None)
            if tturn:
                guesses.append((s["strategy_id"], tturn["chosen"]))
        guess_counts = Counter(g for _, g in guesses)
        agreement.append({
            "turn": t,
            "distinct_guesses": len(guess_counts),
            "guess_groups": [
                {"guess": g, "count": c, "strategies": [sid for sid, gs in guesses if gs == g]}
                for g, c in sorted(guess_counts.items(), key=lambda kv: -kv[1])
            ],
        })

    # Solve-depth distribution.
    depth_counter = Counter(solve_depths)
    depth_dist = [
        {"depth": d, "count": c, "strategies": [
            s["strategy_id"] for s in strategies_data if len(s["turns"]) == d
        ]}
        for d, c in sorted(depth_counter.items())
    ]

    return {
        "solve_depth_distribution": depth_dist,
        "pool_decay": pool_decay,
        "agreement_by_turn": agreement,
        "min_solve_depth": min(solve_depths),
        "max_solve_depth": max(solve_depths),
        "mean_solve_depth": round(sum(solve_depths) / len(solve_depths), 3),
    }


# ─── Main ──────────────────────────────────────────────────────────────
def main() -> None:
    print("[simulator] loading corpus")
    corpus = WordCorpus.from_repo_root(REPO_ROOT)
    table = FeedbackTable(corpus)
    answers: tuple[str, ...] = corpus.answers
    allowed: tuple[str, ...] = corpus.all_allowed
    print(f"[simulator] corpus: {len(answers)} answers, {len(allowed)} allowed")

    sample_path = REPO_ROOT / "results" / "web" / "sample-replays.json"
    sample_replays = json.loads(sample_path.read_text())

    cases_spec = [
        {
            "case_id": "aback-unknown",
            "label": "ABACK · Unknown mode",
            "hidden_answer": "aback",
            "mode": "unknown",
            "description": "10 strategies, one hidden answer. The mode is hidden behind a Bayesian posterior; all strategies receive the same feedback and must infer the rest.",
        },
    ]

    cases_out: list[dict] = []
    for spec in cases_spec:
        mode_replays = sample_replays.get(spec["mode"], {})
        # We need replays where the hidden answer matches; check the first
        # replay we have (sample-replays only stores one per strategy/mode
        # so they all share the same hidden answer in practice).
        first_replay = next(iter(mode_replays.values()))
        if first_replay.get("hidden_answer") != spec["hidden_answer"]:
            print(f"[simulator] skipping {spec['case_id']}: hidden answer "
                  f"{first_replay.get('hidden_answer')!r} != {spec['hidden_answer']!r}")
            continue

        hidden_mode = first_replay.get("hidden_mode")
        print(f"[simulator] case {spec['case_id']}: hidden_mode={hidden_mode}")

        strategies_data: list[dict] = []
        for strategy_id in STRATEGY_ORDER:
            replay = mode_replays.get(strategy_id)
            if not replay:
                print(f"[simulator]   missing replay for {strategy_id}, skipping")
                continue
            print(f"[simulator]   simulating {strategy_id}")
            turns = simulate_strategy_case(
                strategy_id, table, answers, allowed,
                replay["steps"], spec["hidden_answer"], spec["mode"],
                top_k=TOP_K,
            )
            strategies_data.append({
                "strategy_id": strategy_id,
                "label": STRATEGY_LABELS[strategy_id],
                "tier": STRATEGY_TIERS[strategy_id],
                "metric": STRATEGY_METRICS[strategy_id],
                "solved": replay.get("solved", True),
                "total_turns": len(turns),
                "turns": turns,
            })

        case_out = {
            "case_id": spec["case_id"],
            "label": spec["label"],
            "description": spec["description"],
            "hidden_answer": spec["hidden_answer"],
            "mode": spec["mode"],
            "hidden_mode": hidden_mode,
            "total_candidates": len(answers),
            "strategies": strategies_data,
            "aggregate": compute_aggregate_stats(strategies_data),
        }
        cases_out.append(case_out)

    payload = {
        "schema_version": 1,
        "cases": cases_out,
    }

    out_engine = REPO_ROOT / "results" / "web" / "simulator.json"
    out_engine.parent.mkdir(parents=True, exist_ok=True)
    out_engine.write_text(json.dumps(payload, indent=2))
    print(f"[simulator] wrote {out_engine}")

    out_web = REPO_ROOT / "apps" / "web" / "public" / "generated" / "simulator.json"
    out_web.parent.mkdir(parents=True, exist_ok=True)
    out_web.write_text(json.dumps(payload, indent=2))
    print(f"[simulator] synced {out_web}")


if __name__ == "__main__":
    main()

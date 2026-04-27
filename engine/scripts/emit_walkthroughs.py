"""Emit rich decision-walkthrough metadata for the web homepage demos.

Generates ``results/web/walkthroughs.json`` (and mirrors it into the Next
``public/generated`` tree) containing:

1. **CRANE partition analysis** — full bucket histogram, Shannon entropy,
   and the exact membership of the ``BYYBY`` bucket. This is the numeric
   backing for the "bucket collision" demo (AFTER and AMBER both produce
   BYYBY against CRANE).
2. **Opener comparison** — entropy and evil-adversary bucket size for a
   handful of well-known openers (SALET, RAISE, SOARE, CRANE, SLATE,
   ADIEU, TARES). Lets the site show a small ranking table.
3. **Evil-DP decision trace** — at each of the three non-trivial turn
   states the DP visits along RAISE → YAULD → TENCH → WHOOP, the top-K
   candidate guesses ranked by the quantity the DP optimizes:
   ``|T(C, g)|`` (adversarial successor bucket size). Makes it possible
   to render "here are the alternatives and why each was rejected."

Usage::

    cd engine
    uv run python -m scripts.emit_walkthroughs         # requires scripts/__init__.py
    # or, as a direct script:
    uv run python scripts/emit_walkthroughs.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

# Make the engine's src/ importable when running the script directly.
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
    shannon_entropy,
    worst_case_bucket,
)

REPO_ROOT = HERE.parent.parent

# Strategies the home-page showcase rotates through. Tree data is emitted for
# any of these whose metric is partition-based (i.e. expressible from a
# single partition_counts dict). Letter-frequency and random-valid degrade to
# null tree data on the web side.
SHOWCASE_STRATEGIES = [
    "expected-entropy",
    "minimax",
    "evil-dp",
    "candidate-elimination",
    "evil-shortest-path",
]

# Metric definitions: how to score each candidate guess from its
# partition_counts dictionary, and how to rank+display the resulting score.
def metric_for(strategy_id: str):
    """Return (rank_key, display_score, label, unit, decimals, goal)."""
    if strategy_id == "expected-entropy":
        return (
            lambda counts, total: -shannon_entropy(counts),
            lambda counts, total: shannon_entropy(counts),
            "entropy", "bits", 2, "max",
        )
    if strategy_id == "minimax":
        return (
            lambda counts, total: worst_case_bucket(counts),
            lambda counts, total: worst_case_bucket(counts),
            "worst bucket", None, 0, "min",
        )
    if strategy_id == "candidate-elimination":
        return (
            lambda counts, total: expected_remaining(counts),
            lambda counts, total: expected_remaining(counts),
            "E[remaining]", None, 1, "min",
        )
    if strategy_id in ("evil-shortest-path", "evil-dp"):
        return (
            lambda counts, total: evil_forced_bucket_size(counts),
            lambda counts, total: evil_forced_bucket_size(counts),
            "|T|", None, 0, "min",
        )
    return None


# ── Helpers ─────────────────────────────────────────────────────────────
def guess_stats(table: FeedbackTable, guess: str, candidates: tuple[str, ...]) -> dict:
    counts = table.partition_counts(guess, candidates)
    return {
        "guess": guess,
        "entropy": round(shannon_entropy(counts), 4),
        "evil_bucket": evil_forced_bucket_size(counts),
        "num_buckets": len(counts),
        "largest_bucket": max(counts.values(), default=0),
    }


def rank_guesses_for_strategy(
    table: FeedbackTable,
    strategy_id: str,
    candidates: tuple[str, ...],
    allowed: tuple[str, ...],
    chosen: str,
    top_k: int = 5,
) -> list[dict]:
    """Rank every allowed guess by the strategy's own metric, take top_k.

    Always includes the chosen guess (even if it ranks below top_k) so the
    UI can show whether the actual choice was the rank-1 winner under a
    purely greedy reading of the metric — which is the whole point of the
    evil-dp turn-2 lookahead-vs-greedy demonstration.
    """
    spec = metric_for(strategy_id)
    if spec is None:
        return []
    rank_fn, display_fn, _label, _unit, _decimals, _goal = spec
    total = len(candidates)
    candidate_set = set(candidates)
    # Mirror the engine's typical tiebreak: identical metric scores break by
    # (guess-in-candidate-pool first), then lexicographic — so on tied
    # final turns the chosen guess (always in the pool) ranks ahead of
    # lexicographically earlier non-pool words.
    scored: list[tuple[float, int, str, float]] = []
    for guess in allowed:
        counts = table.partition_counts(guess, candidates)
        rank_key = rank_fn(counts, total)
        display = display_fn(counts, total)
        in_pool = 0 if guess in candidate_set else 1
        scored.append((rank_key, in_pool, guess, display))
    scored.sort()
    selected = scored[:top_k]
    chosen_entry = next((s for s in scored if s[2] == chosen), None)
    if chosen_entry and chosen_entry not in selected:
        selected.append(chosen_entry)
    out: list[dict] = []
    for rank, (_rank_key, _in_pool, guess, display) in enumerate(selected, start=1):
        out.append({
            "rank": rank,
            "guess": guess,
            "score": round(float(display), 4),
            "is_chosen": guess == chosen,
            "is_candidate": guess in candidate_set,
        })
    return out


def compute_showcase_trees(
    repo_root: Path,
    table: FeedbackTable,
    answers: tuple[str, ...],
    allowed: tuple[str, ...],
    top_k: int = 5,
) -> dict:
    """Per-strategy per-turn tree data for the home-page showcase animation.

    Reads the existing standard-mode sample-replays for each strategy in
    SHOWCASE_STRATEGIES, reconstructs the candidate pool entering each turn,
    and emits the top-K candidate guesses ranked by that strategy's metric.
    """
    sample_path = repo_root / "results" / "web" / "sample-replays.json"
    sample_replays = json.loads(sample_path.read_text())
    standard = sample_replays.get("standard", {})

    trees: dict[str, list[dict]] = {}
    for strategy_id in SHOWCASE_STRATEGIES:
        spec = metric_for(strategy_id)
        if spec is None:
            continue
        replay = standard.get(strategy_id)
        if not replay:
            continue
        _rank_fn, _display_fn, label, unit, decimals, goal = spec

        steps = replay.get("steps") or []
        per_turn: list[dict] = []
        current_pool: tuple[str, ...] = answers
        for step in steps:
            guess = step["guess"]
            pattern_int = step["pattern"]
            t0 = time.time()
            ranked = rank_guesses_for_strategy(
                table, strategy_id, current_pool, allowed, guess, top_k
            )
            elapsed = time.time() - t0
            print(
                f"[walkthroughs]   {strategy_id:24s} t={step['turn']} "
                f"|C|={len(current_pool):4d} ranked in {elapsed:4.1f}s"
            )
            survivors = tuple(
                sorted(a for a in current_pool if score_guess(guess, a) == pattern_int)
            )
            per_turn.append({
                "turn": step["turn"],
                "candidates_before": len(current_pool),
                "candidates_after": len(survivors),
                "chosen": guess,
                "feedback_text": step["pattern_text"],
                "metric": {
                    "label": label,
                    "unit": unit,
                    "decimals": decimals,
                    "goal": goal,
                },
                "top_candidates": ranked,
            })
            current_pool = survivors
        trees[strategy_id] = per_turn
    return trees


def top_candidates_by_evil_bucket(
    table: FeedbackTable,
    guess_pool: tuple[str, ...],
    candidates: tuple[str, ...],
    chosen: str,
    top_k: int = 8,
) -> list[dict]:
    """Rank every allowed guess by |T(C, g)|, entropy as tiebreak, take top_k.

    Always includes the chosen guess in the output (even if it's not in the
    top_k by |T|), so the UI can show its relative position.
    """
    scored: list[tuple[int, float, str]] = []
    candidate_set = set(candidates)
    for g in guess_pool:
        counts = table.partition_counts(g, candidates)
        eb = evil_forced_bucket_size(counts)
        h = shannon_entropy(counts)
        scored.append((eb, -h, g))
    scored.sort()
    selected = scored[:top_k]
    # Ensure the chosen guess is present in the output, tagged
    chosen_entry = next((s for s in scored if s[2] == chosen), None)
    if chosen_entry and chosen_entry not in selected:
        selected.append(chosen_entry)
    out: list[dict] = []
    for rank, (eb, neg_h, g) in enumerate(selected, start=1):
        out.append({
            "rank": rank,
            "guess": g,
            "evil_bucket": eb,
            "entropy": round(-neg_h, 4),
            "is_chosen": g == chosen,
            "is_candidate": g in candidate_set,
        })
    # Re-sort by evil_bucket asc, entropy desc — the display order
    out.sort(key=lambda d: (d["evil_bucket"], -d["entropy"]))
    # Re-assign ranks for display
    for i, d in enumerate(out, start=1):
        d["rank"] = i
    return out


# ── Main ────────────────────────────────────────────────────────────────
def main() -> None:
    print("[walkthroughs] loading corpus")
    corpus = WordCorpus.from_repo_root(REPO_ROOT)
    table = FeedbackTable(corpus)
    answers: tuple[str, ...] = corpus.answers
    allowed = corpus.all_allowed
    print(f"[walkthroughs] corpus: {len(answers)} answers, {len(allowed)} allowed")

    # ── A. CRANE partition analysis ──
    print("[walkthroughs] computing CRANE partition")
    crane_counts = table.partition_counts("crane", answers)
    sorted_buckets = sorted(crane_counts.items(), key=lambda kv: -kv[1])
    top_buckets = [
        {"pattern": pattern_to_text(p), "size": sz}
        for p, sz in sorted_buckets[:12]
    ]
    byyby_pattern = encode_pattern([0, 1, 1, 0, 1])
    byyby_words = sorted(
        a for a in answers if score_guess("crane", a) == byyby_pattern
    )

    # ── B. Opener comparison ──
    print("[walkthroughs] scoring alternative openers")
    opener_ids = ["salet", "crane", "raise", "soare", "slate", "adieu", "tares", "trace"]
    comparison = [guess_stats(table, g, answers) for g in opener_ids]
    comparison.sort(key=lambda d: -d["entropy"])

    # ── C. Evil-DP decision trace ──
    print("[walkthroughs] computing evil-dp trace")
    all_black = encode_pattern([0, 0, 0, 0, 0])
    yellow_tail = encode_pattern([0, 0, 0, 0, 1])

    c0 = answers
    c1 = tuple(a for a in c0 if score_guess("raise", a) == all_black)
    c2 = tuple(a for a in c1 if score_guess("yauld", a) == all_black)
    c3 = tuple(a for a in c2 if score_guess("tench", a) == yellow_tail)
    print(f"[walkthroughs]   c0={len(c0)}  c1={len(c1)}  c2={len(c2)}  c3={len(c3)}")

    trace: list[dict] = []
    # Turn 1 is the heavyweight case: ~13k guesses × 2315 answers = ~30M ops.
    # Each of the three non-trivial states gets a ranked top-K.
    turn_specs = [
        {"turn": 1, "candidates": c0, "chosen": "raise", "feedback_text": "BBBBB"},
        {"turn": 2, "candidates": c1, "chosen": "yauld", "feedback_text": "BBBBB"},
        {"turn": 3, "candidates": c2, "chosen": "tench", "feedback_text": "BBBBY"},
    ]
    for spec in turn_specs:
        t0 = time.time()
        top = top_candidates_by_evil_bucket(
            table, allowed, spec["candidates"], spec["chosen"], top_k=8
        )
        elapsed = time.time() - t0
        print(f"[walkthroughs]   turn {spec['turn']} ranked in {elapsed:.1f}s")
        trace.append({
            "turn": spec["turn"],
            "candidates_before": len(spec["candidates"]),
            "chosen": spec["chosen"],
            "feedback_text": spec["feedback_text"],
            "candidates_after": {
                1: len(c1),
                2: len(c2),
                3: len(c3),
            }[spec["turn"]],
            "top_candidates": top,
        })

    # Trivial final turn
    trace.append({
        "turn": 4,
        "candidates_before": len(c3),
        "chosen": "whoop",
        "feedback_text": "GGGGG",
        "candidates_after": 0,
        "top_candidates": [{
            "rank": 1,
            "guess": "whoop",
            "evil_bucket": 1,
            "entropy": 0.0,
            "is_chosen": True,
            "is_candidate": True,
        }],
    })

    # ── D. Per-strategy showcase trees ──
    print("[walkthroughs] computing showcase trees")
    showcase_trees = compute_showcase_trees(
        REPO_ROOT, table, answers, allowed, top_k=5
    )

    payload = {
        "schema_version": 2,
        "crane_partition": {
            "guess": "crane",
            "total_candidates": len(answers),
            "nonempty_buckets": len(crane_counts),
            "entropy": round(shannon_entropy(crane_counts), 4),
            "largest_bucket": max(crane_counts.values()),
            "top_buckets": top_buckets,
            "byyby_bucket_size": len(byyby_words),
            "byyby_bucket_words": byyby_words,
        },
        "opener_comparison": comparison,
        "evil_dp_trace": trace,
        "showcase_trees": showcase_trees,
    }

    out = REPO_ROOT / "results" / "web" / "walkthroughs.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2))
    print(f"[walkthroughs] wrote {out}")

    public = REPO_ROOT / "apps" / "web" / "public" / "generated" / "walkthroughs.json"
    public.parent.mkdir(parents=True, exist_ok=True)
    public.write_text(json.dumps(payload, indent=2))
    print(f"[walkthroughs] synced {public}")


if __name__ == "__main__":
    main()

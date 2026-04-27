// Server-side data prep for the home-page StrategyShowcase. Joins
// manifest + summaries + sample-replays into a flat, typed structure
// that the client component can play back without touching raw JSON.

import { STRATEGY_CONTENT } from "@/lib/strategy-content";
import {
  SHOWCASE_ROTATION,
  STRATEGY_FORMULAS,
  STRATEGY_METRICS,
  type MetricSpec,
} from "@/lib/strategy-previews";
import type {
  ManifestPayload,
  SampleReplayPayload,
  ShowcaseTreeTurn,
  StrategyTier,
  SummariesPayload,
  WalkthroughsPayload,
} from "@/types/generated";

export type DemoTraceStep = {
  turn: number;
  guess: string;
  pattern: string; // five-char "BYBYG" string
  remainingBefore: number;
  remainingAfter: number;
  metricValue: number | null;
  // ── Pool snapshots ──
  // Up to 8 representative words from the candidate pool entering this turn
  // (empty on t=1, where the pool is the full corpus). Sourced from the
  // *previous* trace step's candidate_preview.
  poolBeforePreview: string[];
  // Up to 8 representative words from the pool *after* feedback is applied
  // — i.e. the survivors that become the "potential candidates" of the
  // following turn.
  poolAfterPreview: string[];
  // One-line, strategy-specific human-readable explanation of why this
  // guess won at this turn given its objective.
  selectionRationale: string;
  // Tree data for the per-turn ML-style search visualization. Null for
  // strategies whose metric isn't partition-derived (letter-frequency,
  // random-valid) — those degrade to a simpler "chose X" view.
  tree: ShowcaseTreeTurn | null;
};

export type StrategyDemo = {
  id: string;
  label: string;
  tier: StrategyTier | null;
  tierLabel: string | null;
  formula: string;
  objective: string;
  metric: MetricSpec | null;
  hiddenAnswer: string | null;
  trace: DemoTraceStep[];
  stats: {
    standardAvg: number;
    standardWorst: number;
    standardSolveRate: number;
    evilDepth: number;
  } | null;
};

function readNumber(
  explanation: Record<string, unknown> | null | undefined,
  field: string,
): number | null {
  if (!explanation) return null;
  const value = explanation[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Strategy-specific one-line "why this guess won" string. Surfaces the
// quantity each strategy actually optimized in plain English. Tunes to
// the actual metric value pulled from the trace explanation.
function buildRationale(
  strategyId: string,
  metricValue: number | null,
  remainingBefore: number,
  allowedSize: number,
): string {
  const fmt = (n: number, d: number) => n.toFixed(d);
  const allowedTxt = allowedSize.toLocaleString();
  switch (strategyId) {
    case "expected-entropy":
      return metricValue == null
        ? "Highest Shannon entropy among all allowed guesses"
        : `Highest entropy (${fmt(metricValue, 2)} bits) of ${allowedTxt} guesses`;
    case "minimax":
      return metricValue == null
        ? "Smallest worst-case bucket — guards against adversarial feedback"
        : `Smallest worst-case bucket (${metricValue}) — guards against adversarial feedback`;
    case "candidate-elimination":
      return metricValue == null
        ? "Minimum expected remaining candidates — Bayes-optimal one-step"
        : `Minimum expected remaining (${fmt(metricValue, 1)}) — Bayes-optimal one-step`;
    case "evil-dp":
      return metricValue == null
        ? "Memoized DP — guarantees fewest remaining turns"
        : `Adversarial bucket |T|=${metricValue} — recursive DP picks the lookahead-optimal next state`;
    case "evil-shortest-path":
      return metricValue == null
        ? "Smallest one-step adversarial bucket"
        : `Smallest one-step adversarial bucket |T|=${metricValue} (greedy approx of evil-dp)`;
    case "letter-frequency":
      return metricValue == null
        ? "Highest weighted letter coverage"
        : `Highest weighted letter score (${fmt(metricValue, 1)}) — no partition reasoning`;
    case "random-valid":
      return `Hash-seeded uniform pick from ${remainingBefore.toLocaleString()}-word survivor pool`;
    case "posterior-hybrid":
      return metricValue == null
        ? "Weighted blend of standard-mode entropy and evil-bucket reduction"
        : `Posterior-weighted blend (entropy ${fmt(metricValue, 2)} bits term)`;
    case "posterior-expectimax":
      return metricValue == null
        ? "Bayesian expectimax across modes"
        : `Bayesian expectimax: q·E[remaining] + (1−q)·|T| = ${fmt(metricValue, 1)}`;
    case "robust-scalarization":
      return metricValue == null
        ? "Min-max objective across both modes"
        : `Min-max across modes: max(E[remaining], |T|) = ${fmt(metricValue, 1)}`;
    default:
      return "";
  }
}

export function buildStrategyDemos(
  manifest: ManifestPayload,
  summaries: SummariesPayload,
  replays: SampleReplayPayload,
  walkthroughs: WalkthroughsPayload | null = null,
): StrategyDemo[] {
  const stdById = new Map(
    (summaries.standard ?? []).map((row) => [row.strategy_id, row]),
  );
  const evilById = new Map(
    (summaries.evil ?? []).map((row) => [row.strategy_id, row]),
  );
  const manifestById = new Map(manifest.strategies.map((s) => [s.id, s]));

  const treesById = walkthroughs?.showcase_trees ?? {};

  const demos: StrategyDemo[] = [];
  for (const id of SHOWCASE_ROTATION) {
    const trace = replays.standard?.[id];
    const manifestEntry = manifestById.get(id);
    const std = stdById.get(id);
    const evil = evilById.get(id);
    const content = STRATEGY_CONTENT[id];
    if (!trace) continue;

    const metric = STRATEGY_METRICS[id] ?? null;
    const trees = treesById[id] ?? [];
    const treeByTurn = new Map(trees.map((t) => [t.turn, t]));
    const totalCandidates = manifest.answers || 2315;

    // The trace records `remaining_candidates` *after* the guess.
    // We reconstruct the *before* count by walking sequentially,
    // starting from the full corpus. The previous step's candidate_preview
    // becomes the current step's "before pool" preview.
    let runningBefore = totalCandidates;
    let prevPreview: string[] = []; // empty on turn 1 — pool is the full corpus
    const allowedSize = manifest.allowed_guesses || 12972;
    const steps: DemoTraceStep[] = trace.steps.map((step) => {
      const before = runningBefore;
      const after = step.remaining_candidates;
      runningBefore = after;
      const metricValue = metric ? readNumber(step.explanation, metric.field) : null;
      const previewAfter = (step.candidate_preview ?? []).map((w) => w.toUpperCase());
      const previewBefore = prevPreview;
      prevPreview = previewAfter;
      return {
        turn: step.turn,
        guess: step.guess.toUpperCase(),
        pattern: step.pattern_text,
        remainingBefore: before,
        remainingAfter: after,
        metricValue,
        poolBeforePreview: previewBefore,
        poolAfterPreview: previewAfter,
        selectionRationale: buildRationale(id, metricValue, before, allowedSize),
        tree: treeByTurn.get(step.turn) ?? null,
      };
    });

    demos.push({
      id,
      label: manifestEntry?.label ?? id,
      tier: content?.tier ?? manifestEntry?.tier ?? null,
      tierLabel: content?.tierLabel ?? null,
      formula: STRATEGY_FORMULAS[id] ?? "",
      objective: manifestEntry?.objective ?? "",
      metric,
      hiddenAnswer: trace.hidden_answer,
      trace: steps,
      stats: std
        ? {
            standardAvg: std.average_guesses,
            standardWorst: std.worst_case,
            standardSolveRate: std.solve_rate,
            evilDepth: evil?.average_guesses ?? 0,
          }
        : null,
    });
  }
  return demos;
}

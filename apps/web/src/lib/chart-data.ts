import type { SampleReplayPayload, StrategySummary, SummariesPayload } from "@/types/generated";

/** Canonical answer pool size — matches manifest.answers */
const INITIAL_POOL_SIZE = 2315;

export const STRATEGY_COLORS: Record<string, string> = {
  "random-valid": "#94a3b8",
  "letter-frequency": "#f59e0b",
  "candidate-elimination": "#8b5cf6",
  "expected-entropy": "#2563eb",
  "minimax": "#ef4444",
  "adaptive-robust": "#10b981",
};

export const STRATEGY_LABELS: Record<string, string> = {
  "random-valid": "Random",
  "letter-frequency": "Letter Freq",
  "candidate-elimination": "Cand. Elim.",
  "expected-entropy": "Entropy",
  "minimax": "Minimax",
  "adaptive-robust": "Adaptive",
};

export type CandidateDecayPoint = {
  turn: number;
  [strategyId: string]: number;
};

export type InfoGainPoint = {
  turn: number;
  [strategyId: string]: number;
};

export type ScatterPoint = {
  strategy: string;
  label: string;
  avg: number;
  worst: number;
  color: string;
};

export type PosteriorPoint = {
  turn: number;
  [strategyId: string]: number;
};

/**
 * Build candidate pool decay data from standard-mode replays.
 * Each point is { turn, [strategyId]: remainingCandidates }.
 */
export function buildCandidateDecayData(replays: SampleReplayPayload): CandidateDecayPoint[] {
  const standardReplays = replays.standard ?? {};
  const maxTurns = Math.max(
    ...Object.values(standardReplays).map((trace) => trace?.steps?.length ?? 0),
    1,
  );

  const points: CandidateDecayPoint[] = [];

  // Turn 0: all strategies start at full pool
  const turn0: CandidateDecayPoint = { turn: 0 };
  for (const strategyId of Object.keys(standardReplays)) {
    turn0[strategyId] = INITIAL_POOL_SIZE;
  }
  points.push(turn0);

  for (let t = 0; t < maxTurns; t++) {
    const point: CandidateDecayPoint = { turn: t + 1 };
    for (const [strategyId, trace] of Object.entries(standardReplays)) {
      if (trace?.steps?.[t]) {
        point[strategyId] = trace.steps[t].remaining_candidates;
      }
    }
    points.push(point);
  }

  return points;
}

/**
 * Build information gain per turn (bits) from standard-mode replays.
 * info_gain[t] = log2(candidates_before / candidates_after)
 */
export function buildInformationGainData(replays: SampleReplayPayload): InfoGainPoint[] {
  const standardReplays = replays.standard ?? {};
  const maxTurns = Math.max(
    ...Object.values(standardReplays).map((trace) => trace?.steps?.length ?? 0),
    1,
  );

  const points: InfoGainPoint[] = [];

  for (let t = 0; t < maxTurns; t++) {
    const point: InfoGainPoint = { turn: t + 1 };
    for (const [strategyId, trace] of Object.entries(standardReplays)) {
      if (trace?.steps?.[t]) {
        const before = t === 0 ? INITIAL_POOL_SIZE : (trace.steps[t - 1]?.remaining_candidates ?? INITIAL_POOL_SIZE);
        const after = trace.steps[t].remaining_candidates;
        point[strategyId] = before > 0 && after > 0 ? Math.log2(before / after) : 0;
      }
    }
    points.push(point);
  }

  return points;
}

/**
 * Build scatter data: average guesses vs worst case per strategy.
 */
export function buildWorstVsAvgData(summaries: StrategySummary[]): ScatterPoint[] {
  return summaries.map((row) => ({
    strategy: row.strategy_id,
    label: row.label,
    avg: row.average_guesses,
    worst: row.worst_case,
    color: STRATEGY_COLORS[row.strategy_id] ?? "#94a3b8",
  }));
}

/**
 * Build posterior accuracy over turns for unknown-mode strategies.
 */
export function buildPosteriorData(summaries: SummariesPayload): PosteriorPoint[] {
  const unknownRows = summaries.unknown ?? [];
  const allTurns = new Set<number>();

  for (const row of unknownRows) {
    for (const pt of row.posterior_accuracy_by_turn ?? []) {
      allTurns.add(pt.turn);
    }
  }

  const sortedTurns = Array.from(allTurns).sort((a, b) => a - b);

  return sortedTurns.map((turn) => {
    const point: PosteriorPoint = { turn };
    for (const row of unknownRows) {
      const pt = row.posterior_accuracy_by_turn?.find((p) => p.turn === turn);
      if (pt) {
        point[row.strategy_id] = pt.mean_true_mode_posterior;
      }
    }
    return point;
  });
}

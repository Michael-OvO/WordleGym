export type StrategySummary = {
  strategy_id: string;
  label: string;
  objective: string;
  games: number;
  average_guesses: number;
  average_guesses_on_solve: number | null;
  solve_rate: number;
  worst_case: number;
  penalized_average_guesses: number;
  posterior_accuracy_by_turn?: { turn: number; mean_true_mode_posterior: number }[];
};

export type SummariesPayload = {
  standard: StrategySummary[];
  evil: StrategySummary[];
  unknown: StrategySummary[];
};

export type RobustnessPayload = {
  matrix: Record<string, Record<string, number>>;
  mismatch_spread: {
    strategy_id: string;
    standard?: number;
    evil?: number;
    unknown?: number;
    spread: number;
  }[];
};

export type DecisionSnapshot = {
  mode: string;
  strategy_id: string;
  first_guess: string;
  top_partitions: {
    pattern: number;
    pattern_text: string;
    size: number;
  }[];
};

export type ReplayTrace = {
  mode: string;
  branch: string;
  strategy_id: string;
  hidden_answer: string | null;
  hidden_mode: string | null;
  turns: number;
  solved: boolean;
  exhausted: boolean;
  remaining_candidates: number;
  steps: {
    turn: number;
    guess: string;
    pattern: number;
    pattern_text: string;
    pattern_emoji: string;
    remaining_candidates: number;
    candidate_preview: string[];
    explanation: Record<string, unknown>;
    mode_posterior?: Record<string, number> | null;
    standard_candidates?: number | null;
    evil_candidates?: number | null;
  }[];
};

export type SampleReplayPayload = Record<string, Record<string, ReplayTrace>>;

export type StrategyTier = "baseline" | "core" | "experimental" | "aggregate-aware" | "optimal";

export type ManifestStrategy = {
  id: string;
  label: string;
  objective: string;
  tier?: StrategyTier;
  caveat?: string;
};

export type ManifestPayload = {
  schema_version: number;
  answers: number;
  allowed_guesses: number;
  strategies: ManifestStrategy[];
};

// ── Walkthrough metadata (home-page demos) ────────────────────────────
export type WalkthroughBucket = { pattern: string; size: number };

export type CranePartition = {
  guess: string;
  total_candidates: number;
  nonempty_buckets: number;
  entropy: number;
  largest_bucket: number;
  top_buckets: WalkthroughBucket[];
  byyby_bucket_size: number;
  byyby_bucket_words: string[];
};

export type OpenerStats = {
  guess: string;
  entropy: number;
  evil_bucket: number;
  num_buckets: number;
  largest_bucket: number;
};

export type EvilDpCandidate = {
  rank: number;
  guess: string;
  evil_bucket: number;
  entropy: number;
  is_chosen: boolean;
  is_candidate: boolean;
};

export type EvilDpTurn = {
  turn: number;
  candidates_before: number;
  candidates_after: number;
  chosen: string;
  feedback_text: string;
  top_candidates: EvilDpCandidate[];
};

export type ShowcaseTreeMetric = {
  label: string;
  unit: string | null;
  decimals: number;
  goal: "min" | "max";
};

export type ShowcaseTreeCandidate = {
  rank: number;
  guess: string;
  score: number;
  is_chosen: boolean;
  is_candidate: boolean;
};

export type ShowcaseTreeTurn = {
  turn: number;
  candidates_before: number;
  candidates_after: number;
  chosen: string;
  feedback_text: string;
  metric: ShowcaseTreeMetric;
  top_candidates: ShowcaseTreeCandidate[];
};

export type WalkthroughsPayload = {
  schema_version: number;
  crane_partition: CranePartition;
  opener_comparison: OpenerStats[];
  evil_dp_trace: EvilDpTurn[];
  showcase_trees?: Record<string, ShowcaseTreeTurn[]>;
};

// ── Simulator (interactive multi-strategy walkthrough) ──────────────
export type SimulatorMetric = {
  label: string;
  unit: string | null;
  decimals: number;
  goal: "min" | "max";
};

export type SimulatorRankedGuess = {
  rank: number;
  guess: string;
  score: number;
  is_chosen: boolean;
  is_in_pool: boolean;
  extras: Record<string, number> | null;
};

export type SimulatorTurn = {
  turn: number;
  candidates_before: number;
  candidates_after: number;
  pool_preview: string[];
  posterior: { standard: number; evil: number };
  chosen: string;
  chosen_pattern: string;
  chosen_score: number | null;
  top_candidates: SimulatorRankedGuess[];
};

export type SimulatorStrategy = {
  strategy_id: string;
  label: string;
  tier: StrategyTier;
  metric: SimulatorMetric;
  solved: boolean;
  total_turns: number;
  turns: SimulatorTurn[];
};

export type SimulatorAggregate = {
  solve_depth_distribution: { depth: number; count: number; strategies: string[] }[];
  pool_decay: {
    turn: number;
    rows: { strategy_id: string; candidates_before: number; candidates_after: number }[];
  }[];
  agreement_by_turn: {
    turn: number;
    distinct_guesses: number;
    guess_groups: { guess: string; count: number; strategies: string[] }[];
  }[];
  min_solve_depth: number;
  max_solve_depth: number;
  mean_solve_depth: number;
};

export type SimulatorCase = {
  case_id: string;
  label: string;
  description: string;
  hidden_answer: string;
  mode: "standard" | "evil" | "unknown";
  hidden_mode: string | null;
  total_candidates: number;
  strategies: SimulatorStrategy[];
  aggregate: SimulatorAggregate;
};

export type SimulatorPayload = {
  schema_version: number;
  cases: SimulatorCase[];
};


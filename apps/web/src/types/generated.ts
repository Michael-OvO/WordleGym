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

export type ManifestPayload = {
  schema_version: number;
  answers: number;
  allowed_guesses: number;
  strategies: {
    id: string;
    label: string;
    objective: string;
  }[];
};


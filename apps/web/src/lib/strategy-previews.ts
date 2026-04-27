// Shared per-strategy display metadata. Used by:
//   - StrategyCard (home + docs index): inline LaTeX preview of the objective
//   - StrategyShowcase (home hero): per-turn metric extraction from trace
//     explanation, plus the same formula rendered display-mode

import type { StrategyTier } from "@/types/generated";

// LaTeX source for each strategy's headline objective. Inline-rendered on
// cards and display-rendered in the showcase hero.
export const STRATEGY_FORMULAS: Record<string, string> = {
  "random-valid": "g_t = C[\\operatorname{hash}(h_t) \\bmod |C|]",
  "letter-frequency":
    "\\sum_i f_{\\text{pos}}(g_i, i) + 0.4 \\sum_{c \\in g} f(c)",
  "candidate-elimination": "\\min_{g} \\; \\sum_{r} \\frac{|B_r|^2}{|C|}",
  "expected-entropy": "\\max_{g} \\; -\\sum_r p_r \\log_2 p_r",
  "minimax": "\\min_{g} \\; \\max_{r} \\; |B_r(C, g)|",
  "posterior-hybrid": "w_s \\, \\hat{H}(g) \\;+\\; w_e \\, r(g)",
  "evil-shortest-path": "\\min_{g} \\; |T(C, g)|",
  "posterior-expectimax":
    "\\min_{g} \\; q\\,\\mathbb{E}[|C'|] + (1{-}q)\\,|T|",
  "robust-scalarization":
    "\\min_{g} \\; \\max\\bigl(\\mathbb{E}[|C'|],\\, |T|\\bigr)",
  "evil-dp": "D(C) = \\min_{g} \\bigl[\\, 1 + D(T(C,g)) \\,\\bigr]",
};

// Per-strategy mapping of the explanation-field key whose value is the
// quantity the strategy actually optimized on a given turn. Showing this
// next to each turn in the showcase lets the viewer see *why* the strategy
// picked that guess in its own terms.
export type MetricSpec = {
  field: string;        // key inside trace.steps[].explanation
  label: string;        // short display label (eyebrow caps)
  unit?: string;        // e.g. "bits"
  decimals?: number;    // formatting precision; default 0 (integer)
  goal: "min" | "max";  // helps the UI annotate "smaller is better" arrows
};

export const STRATEGY_METRICS: Record<string, MetricSpec> = {
  "random-valid": { field: "pool_size", label: "pool", goal: "min" },
  "letter-frequency": {
    field: "score",
    label: "letter score",
    decimals: 1,
    goal: "max",
  },
  "candidate-elimination": {
    field: "expected_remaining",
    label: "E[remaining]",
    decimals: 1,
    goal: "min",
  },
  "expected-entropy": {
    field: "entropy",
    label: "entropy",
    unit: "bits",
    decimals: 2,
    goal: "max",
  },
  "minimax": { field: "worst_case", label: "worst bucket", goal: "min" },
  "posterior-hybrid": {
    field: "entropy",
    label: "entropy",
    unit: "bits",
    decimals: 2,
    goal: "max",
  },
  "evil-shortest-path": { field: "evil_forced_bucket", label: "|T|", goal: "min" },
  "posterior-expectimax": {
    field: "expected_remaining",
    label: "E[remaining]",
    decimals: 1,
    goal: "min",
  },
  "robust-scalarization": {
    field: "expected_remaining",
    label: "robust obj",
    decimals: 1,
    goal: "min",
  },
  "evil-dp": { field: "evil_forced_bucket", label: "|T|", goal: "min" },
};

// Display order in the hero showcase rotation. Mixes a couple of baselines
// with the headline-grade strategies so the viewer sees a contrast.
export const SHOWCASE_ROTATION: string[] = [
  "expected-entropy",
  "minimax",
  "evil-dp",
  "letter-frequency",
  "random-valid",
];

export const TIER_ACCENT: Record<StrategyTier, string> = {
  baseline: "var(--neutral)",
  core: "var(--text)",
  experimental: "var(--text)",
  "aggregate-aware": "var(--text)",
  optimal: "var(--tile-correct)",
};

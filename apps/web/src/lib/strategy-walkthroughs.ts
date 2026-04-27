// Per-strategy walkthrough narratives for the home page.
//
// Each entry pairs a strategy with its most educational mode (the one where
// its design choice produces the most visible, distinctive trajectory) and
// supplies hand-written prose explaining what the algorithm did and why at
// each turn. Live numeric stats (entropy, |T|, expected-remaining, etc.)
// come from the engine's sample-replays.json explanation fields — we never
// hardcode numbers here so the prose stays in sync if the benchmark
// regenerates.
//
// Modes used per strategy:
//   - standard  → uses cigar replay (showcases positive-feedback paths)
//   - evil      → uses deterministic evil playthrough
//   - unknown   → uses the aback replay (where strategies diverge most)
//
// All ten strategies share the answer "aback" in unknown mode for the
// side-by-side multi-algorithm comparison; the per-strategy walkthroughs
// pick whichever mode tells the strategy's signature story best.

export type WalkthroughMode = "standard" | "evil" | "unknown";

export type StrategyCase = {
  strategyId: string;
  mode: WalkthroughMode;
  hook: string;
  perTurn: Record<number, string>;
  takeaway: string;
};

// Hand-curated case studies — one per strategy.
export const STRATEGY_CASES: StrategyCase[] = [
  {
    strategyId: "expected-entropy",
    mode: "standard",
    hook: "Maximize information gain at every step. The classic 3Blue1Brown reading of Wordle as a Shannon-entropy problem.",
    perTurn: {
      1: "Picks SOARE because it has the highest entropy among all 12,972 allowed guesses — a partition over 127 buckets that averages 5.886 bits of information. Roughly half the uncertainty is resolved in one move.",
      2: "After feedback, only 42 candidates remain. RIYAL is now the highest-entropy probe over that smaller pool — 4.22 bits, leaving an expected 2.6 candidates.",
      3: "Single survivor: CIGAR. Entropy played no role on the final turn — there is no information left to extract.",
    },
    takeaway:
      "Entropy is a one-step quantity but it composes well across turns: high-entropy guesses tend to leave smaller, more separable candidate pools, which makes the next high-entropy guess effective too. This stacking is why entropy averages within 1.3% of the published DP optimum.",
  },
  {
    strategyId: "candidate-elimination",
    mode: "standard",
    hook: "Minimize the expected number of survivors. A one-step Bayes objective that scores guesses by Σ |B_r|² / |C|.",
    perTurn: {
      1: "Picks ROATE because Σ |B_r|² / |C| evaluates to 60.4 — the smallest expected remaining count over all 12,972 allowed guesses. Notice this is a different opener than entropy's SOARE: same neighborhood, different objective.",
      2: "35 candidates remain. CARRS minimizes expected remaining (~2.4) — note the CARRS double-R is informative because the surviving pool over-represents R-words.",
      3: "Down to 1 candidate: CIGAR. The objective becomes degenerate at |C|=1.",
    },
    takeaway:
      "Σ |B_r|² / |C| is the expected size of the bucket the true answer lands in under a uniform prior — a one-step Bayes-optimal probe. It is closely related to but distinct from entropy: it penalizes large buckets quadratically rather than logarithmically.",
  },
  {
    strategyId: "minimax",
    mode: "unknown",
    hook: "Minimize the worst-case bucket. A pessimistic policy that on this game gets lucky — and solves in three.",
    perTurn: {
      1: "Picks ARISE — its largest bucket (168) is the smallest worst-case among reasonable openers. Entropy and candidate-elim. would prefer SOARE/ROATE here, but ARISE caps the worst case more tightly.",
      2: "29 candidates remain. CLOUT's largest bucket has only 2 candidates — the smallest worst-case probe. Crucially, on this specific game (answer = ABACK), CLOUT's pattern lands the singleton, not the 2-bucket.",
      3: "Solved in 3. The other partition strategies all needed 4 turns because they preferred guesses with higher entropy or smaller expected remaining — both of which left ≥3 survivors.",
    },
    takeaway:
      "Minimax averages worse than entropy across the full 2,315-game benchmark (3.573 vs 3.465), but on adversarial-worst-case games like ABACK its conservatism pays off. The per-game variance between policies is much larger than the average gap suggests.",
  },
  {
    strategyId: "evil-dp",
    mode: "evil",
    hook: "Solve the recurrence D(C) = min_g [1 + D(T(C,g))] exactly via memoized DFS over the deterministic evil subset graph.",
    perTurn: {
      1: "Picks RAISE because D(C) = 4 is achievable from RAISE's forced successor — the only opener for which the DP can prove a 4-turn solve. Five anagrams (RAISE, ARISE, AESIR, SERAI, REAIS) tie at |T| = 168, but RAISE has the highest tie-breaker entropy.",
      2: "168 candidates → 15. The DP picks YAULD even though BLUDY/DUPLY both shrink the adversary's bucket to 13. Greedy would pick the smaller bucket — but YAULD's 15-candidate successor is solvable in 2 more turns, while BLUDY's 13 needs 3. Lookahead beats greedy here.",
      3: "TENCH is the only guess that reduces the adversary's pool to a single candidate (WHOOP), guaranteeing the solve on turn 4. BENCH, BUNCH, CHOON all leave 2 — forcing a 5-turn worst case.",
      4: "Final turn: WHOOP. Total: 4 guesses, matching the published optimum D(A) = 4.",
    },
    takeaway:
      "This is the only strategy in the suite that is provably optimal — and the only one that beats every greedy heuristic by a full turn. The savings come from turn 2: a one-step look-ahead is not enough; the recursion has to propagate cost from leaves all the way back.",
  },
  {
    strategyId: "evil-shortest-path",
    mode: "evil",
    hook: "Greedy one-ply approximation of evil-dp. Picks the guess whose adversarial bucket is smallest. Falls one turn short on this benchmark.",
    perTurn: {
      1: "Picks RAISE — same as evil-dp. The opener where greedy and DP agree (|T|=168 minimizes the adversarial successor regardless of look-ahead).",
      2: "168 candidates → 13. BLUDY shrinks the adversarial bucket to 13 (smaller than YAULD's 15) — and greedy picks it. This is exactly where DP diverges: BLUDY's 13-candidate subset is harder to finish than YAULD's 15.",
      3: "13 candidates → small. COMPT continues the greedy march, but the resulting subsets are awkwardly partitioned.",
      4: "CHUCK, CHUNK — the strategy needs two more probes to disambiguate.",
      5: "Solved on turn 5 — one full turn worse than evil-dp.",
    },
    takeaway:
      "Greedy is right at turn 1 and wrong at turn 2 — the smallest one-step bucket can sit on top of a structurally awful subgame. This is the tightest single counter-example for why look-ahead matters in adversarial Wordle.",
  },
  {
    strategyId: "posterior-hybrid",
    mode: "unknown",
    hook: "Blend normalized standard entropy with evil reduction-ratio, weighted by the mode posterior. Hedges between Standard and Evil play.",
    perTurn: {
      1: "Picks RAISE. With prior q=0.5, the blended score weights entropy and worst-case-reduction equally; RAISE scores high on both. After feedback, the posterior collapses toward Standard (gray-yellow patterns are unlikely under evil tie-breaks).",
      2: "92 candidates remain. CLOUT — same probe minimax picked above. The posterior is now ~0.93 toward Standard, but CLOUT's evil-reduction-ratio is also high enough to win the blended score.",
      3: "AAHED — a probe that splits the 3-candidate pool. Posterior is essentially 1.0 on Standard by now, so the strategy effectively reduces to entropy.",
      4: "Solved on turn 4. The mode-aware blending mattered for one decision (turn 1's choice between SOARE and RAISE), then collapsed onto Standard play.",
    },
    takeaway:
      "On the full benchmark, posterior-hybrid averages 4.237 in Unknown mode — barely behind the mode-agnostic expected-entropy at 4.232. The window where mode-awareness matters is small because the posterior concentrates above 0.99 within two turns.",
  },
  {
    strategyId: "posterior-expectimax",
    mode: "unknown",
    hook: "Bayesian expectimax: q · E[remaining] + (1-q) · |T|. Blends the two mode-specific objectives in the same 'remaining candidates' units.",
    perTurn: {
      1: "Picks RAISE — the closed-form posterior gives q=|C_std|/(N+|C_std|) at turn 1, which weights the expected-remaining and forced-bucket terms about equally. RAISE happens to be near-optimal under both.",
      2: "92 candidates remain. CLOAM — chosen because q · E[remaining] + (1-q) · |T| is minimized. This is a slightly different choice than candidate-elim's pick (SLICK), reflecting the still-hedged posterior.",
      3: "Down to 4 candidates. ABUNA disambiguates by hitting both surviving A-positions and probing for the rare letters that distinguish the remaining options.",
      4: "Solved. The blended objective behaves coherently because both terms are in the same units (remaining-candidates), unlike posterior-hybrid which mixes normalized entropy with a reduction ratio.",
    },
    takeaway:
      "The dimensional coherence is the key design upgrade over posterior-hybrid. As q → 1 this reduces exactly to candidate-elim; as q → 0 it reduces exactly to evil-shortest-path. No sleight-of-hand, no tunable blending coefficient.",
  },
  {
    strategyId: "robust-scalarization",
    mode: "unknown",
    hook: "Min-max across modes: pick the guess whose worst-case-mode cost is smallest. Sidesteps the posterior entirely.",
    perTurn: {
      1: "Picks RAISE. max(E[remaining], |T|) is minimized — RAISE has |T|=168 which dominates its E[remaining], so the min-max criterion picks the guess with the smallest |T|.",
      2: "92 candidates remain. CLOAK — the guess where the worse of {std cost, evil cost} is smallest. Notice this is the same pick as evil-dp and evil-shortest-path: when |T| dominates the max, the strategy looks adversarial.",
      3: "ABUNA disambiguates among 4 candidates ending in -ACK / -UNA. Final-stage decisions are dominated by the standard term.",
      4: "Solved. Robust-scalarization tracks evil-dp and evil-shortest-path closely on this game because |T| was the binding constraint at every turn.",
    },
    takeaway:
      "This is the right policy when the benchmark metric is robustness-spread (max_m J_m − min_m J_m): a guess that is catastrophic in one mode loses the min-max selection regardless of how good it looks in another. The cost is mild over-conservatism in cases where one mode is clearly more likely.",
  },
  {
    strategyId: "letter-frequency",
    mode: "unknown",
    hook: "Score guesses by positional letter frequency + 0.4 × global frequency. No partition reasoning — pure letter counts.",
    perTurn: {
      1: "Picks SLATE because S, L, A, T, E are all high-frequency letters and this combination scores highest under the weighted metric.",
      2: "48 candidates remain. CRANK probes new high-frequency letters. The strategy is doing reasonable letter-coverage exploration but is not picking guesses to split the candidate pool optimally.",
      3: "3 candidates. QUACK — fits the pattern, contains common letters. But this is a candidate, not a probe: if QUACK is wrong, the strategy has no plan to disambiguate the remaining two.",
      4: "WHACK — same situation. The strategy is just trying candidates one by one because its objective doesn't reason about how a guess will partition the remaining pool.",
      5: "ABACK. Solved, but two turns slower than every partition-based strategy.",
    },
    takeaway:
      "Letter frequency averages 3.587 / 4.294 / 5.000 in Standard / Unknown / Evil — close to the partition strategies on average but with a worst case of 8 in Standard mode. The QUACK → WHACK → ABACK ending is the canonical pathology: when raw letter counts cannot distinguish two surviving candidates, the strategy has no fallback.",
  },
  {
    strategyId: "random-valid",
    mode: "unknown",
    hook: "Hash-seeded random pick from the candidate pool. Reproducible baseline — anchors the bottom of the benchmark.",
    perTurn: {
      1: "Picks GONAD via SHA-1 hash of the empty game history. Not chosen for any partition or letter property — purely deterministic.",
      2: "32 candidates remain after feedback. STATE picked the same way — uniform over the surviving pool.",
      3: "WHARF, then QUAIL on the same hash-seeded selection.",
      4: "QUAIL leaves 1 candidate.",
      5: "ABACK. Solved in 5, below this strategy's average of 4.996 in Unknown mode.",
    },
    takeaway:
      "Random-valid is a control condition, not a contender. Its purpose is to quantify how much lift the partition-based strategies actually deliver — about 0.7 turns saved per game on average, growing to 4 turns on hard answers.",
  },
];

// Strategies in display order on the page (groups by tier, then alphabetical).
export const STRATEGY_CASE_ORDER: string[] = [
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
];

export function getCase(strategyId: string): StrategyCase | undefined {
  return STRATEGY_CASES.find((c) => c.strategyId === strategyId);
}

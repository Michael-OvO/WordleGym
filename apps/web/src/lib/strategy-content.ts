import type { StrategyTier } from "@/types/generated";

export type StrategySection = {
  id: string;
  title: string;
  subtitle: string;
  tier: StrategyTier;
  tierLabel: string;
  localObjective: string;
  caveat: string;
  overview: string[];
  howItWorks: string[];
  mathFormulas: { label: string; display: string; explanation: string }[];
  pseudocode: string;
  strengths: string[];
  weaknesses: string[];
};

export const TIER_METADATA: Record<StrategyTier, { label: string; description: string }> = {
  baseline: {
    label: "Baseline",
    description:
      "Control conditions that make benchmark results interpretable. Not presented as algorithmic contributions.",
  },
  core: {
    label: "Core greedy partition",
    description:
      "One-ply partition heuristics over the feedback-pattern distribution. Principled local objectives, not globally optimal over the full decision tree.",
  },
  experimental: {
    label: "Experimental mode-aware",
    description:
      "Hybrid heuristics that use the mode posterior. Coherent and useful as benchmarks, but not Bayes-optimal Unknown-mode solvers.",
  },
  "aggregate-aware": {
    label: "Aggregate-aware (practical)",
    description:
      "One-step approximations of the exact aggregate-optimal decision trees from the benchmark spec. The full DPs (V(C), W(C), D(C), V_U(C), ...) are computationally prohibitive at Wordle scale; these strategies implement the spec's named practical-candidate policies and are directly aligned with the corresponding recurrences.",
  },
  optimal: {
    label: "Optimal (where tractable)",
    description:
      "Exact dynamic-program solutions for subproblems where the DP is actually tractable. At Wordle scale this currently covers Evil mode only: deterministic successors shrink the reachable subset graph to a few thousand nodes, so memoized DFS with a modest beam recovers the true D(C) optimum.",
  },
};

export const BENCHMARK_DISCLAIMER =
  "WordleGym strategies are benchmark policies rather than claimed optimal solvers. Some are intentionally simple baselines; others are one-ply partition heuristics. The partition-based strategies optimize local feedback metrics, which may differ from aggregate objectives such as average guesses, worst-case guesses, solve rate, or penalized average guesses.";

export const STRATEGY_CONTENT: Record<string, StrategySection> = {
  "random-valid": {
    id: "random-valid",
    title: "Random Valid",
    subtitle: "Baseline / sanity check — reproducible lower-bound control condition",
    tier: "baseline",
    tierLabel: "Baseline",
    localObjective: "No optimization — a seeded random pick from the candidate set.",
    caveat:
      "Not a competitive solver. Included as a control condition so benchmark deltas are interpretable.",
    overview: [
      "Random Valid selects a pseudo-random word from the current candidate set. The random seed is derived deterministically from the decision state, so identical states always produce identical guesses. The strategy is intended as a reproducible baseline rather than a competitive solver.",
      "The value of keeping it in the suite is diagnostic: it answers the question “how much better is a real strategy than doing almost nothing intelligent?” by anchoring the bottom of every benchmark table with a deterministic, reproducible number.",
    ],
    howItWorks: [
      "Each turn the strategy computes a deterministic hash over the game history (guesses and feedback patterns). The hash is converted to a numeric seed.",
      "The seed modulo the candidate-pool size picks a word from the words still consistent with all observed feedback. The pool shrinks each turn as feedback eliminates inconsistent words, but the strategy makes no attempt to choose guesses that maximize that shrinkage.",
      "Because the hash is deterministic, rerunning the benchmark produces identical guesses, which keeps it useful as a reproducible control condition rather than a noisy random policy.",
    ],
    mathFormulas: [
      {
        label: "Seed derivation",
        display: "\\text{seed} = \\text{hash}(s_1, f_1, s_2, f_2, \\ldots)",
        explanation:
          "A deterministic hash of the game history. The Python engine uses SHA-1 truncated to 12 hex digits; the browser client uses a polynomial rolling hash. The two hashes differ, so per-game guesses are not identical across implementations — but within each implementation guesses are fully reproducible.",
      },
      {
        label: "Guess selection",
        display: "g_t = C[\\text{seed} \\bmod |C|]",
        explanation:
          "The seed modulo the candidate pool size selects the guess. C is the pool of words consistent with all prior feedback.",
      },
    ],
    pseudocode: `function chooseGuess(candidates, gameHistory):
    seed = hash(gameHistory)
    index = seed mod len(candidates)
    return candidates[index]`,
    strengths: [
      "Zero computational cost — no scoring or ranking needed",
      "Deterministic and reproducible via hash seeding",
      "Always selects a valid candidate (never wastes a guess on an impossible answer)",
      "Useful control condition for quantifying the lift of every other strategy",
    ],
    weaknesses: [
      "Not an algorithmic contribution — this is a control condition, not a solver",
      "Makes no use of information theory, partitioning, or worst-case analysis",
      "Expected performance is significantly worse than every other strategy in the suite",
      "Ignores game mode (standard / evil / unknown) entirely",
    ],
  },

  "letter-frequency": {
    id: "letter-frequency",
    title: "Letter Frequency",
    subtitle: "Cheap heuristic baseline — candidate-only, no partition reasoning",
    tier: "baseline",
    tierLabel: "Baseline",
    localObjective:
      "Maximize a weighted sum of positional letter frequency and global unique-letter frequency within the candidate set.",
    caveat:
      "Ignores feedback-pattern partitions; the 0.4 global weight is a tunable design choice, not derived from an optimality argument.",
    overview: [
      "Letter Frequency scores each candidate by a weighted combination of positional letter frequency (how often each letter appears at each position among remaining candidates) and global unique-letter frequency (how common each letter is overall). It only guesses from the candidate set, so it is fast but cannot use non-answer probe words.",
      "This is a standard lightweight Wordle heuristic. Its role in the suite is to separate two effects: how much solving power comes from simple letter statistics, versus how much comes from full feedback-pattern partitioning. A large gap between this strategy and the partition-based strategies is evidence that partition reasoning is pulling the weight.",
    ],
    howItWorks: [
      "The strategy builds two frequency tables from the current candidate pool. The positional table counts how often each letter appears at each of the 5 positions. The global table counts the number of candidates containing each letter (counting each letter once per word, not per occurrence).",
      "Each candidate’s positional score is the sum of positional frequencies at its positions. Its global score sums the global frequencies of its unique letters — repeated letters are counted once to avoid biasing toward double-letter words.",
      "The final score is positional_score + 0.4 * global_score. The 0.4 weight balances position-specific and general letter coverage; it is a tunable design choice, not a quantity derived from an optimality argument. Ties are broken alphabetically.",
    ],
    mathFormulas: [
      {
        label: "Positional frequency",
        display: "f_{\\text{pos}}(c, i) = |\\{w \\in C : w_i = c\\}|",
        explanation: "Count of candidates where character c appears at position i (0-indexed).",
      },
      {
        label: "Global frequency",
        display: "f_{\\text{global}}(c) = |\\{w \\in C : c \\in w\\}|",
        explanation: "Count of candidates containing character c (unique per word).",
      },
      {
        label: "Combined score",
        display:
          "\\text{score}(g) = \\sum_{i=0}^{4} f_{\\text{pos}}(g_i, i) + 0.4 \\sum_{c \\in \\text{unique}(g)} f_{\\text{global}}(c)",
        explanation:
          "The positional contribution dominates, while the global term rewards letters that appear frequently anywhere in the candidate pool. The 0.4 coefficient is a hyperparameter.",
      },
    ],
    pseudocode: `function chooseGuess(candidates):
    pos_freq = countByPosition(candidates)
    global_freq = countByLetter(candidates)

    best = null, bestScore = -inf
    for guess in candidates:
        score = sum(pos_freq[i][guess[i]] for i in 0..4)
        score += 0.4 * sum(global_freq[c] for c in unique(guess))
        if score > bestScore:
            best, bestScore = guess, score
    return best`,
    strengths: [
      "Linear in candidate pool size — no partition computation required",
      "Surprisingly strong empirical performance for such a simple policy",
      "Balances position-specific and general letter coverage",
      "Good early-game baseline when the candidate pool is still large",
    ],
    weaknesses: [
      "Does not reason about how feedback patterns will partition the candidate pool",
      "May prefer guesses with common letters even when those letters fail to split the pool",
      "Restricted to guessing words inside the candidate set — can’t use non-answer probes",
      "The 0.4 global weight is empirically tuned, not derived from an objective",
    ],
  },

  "candidate-elimination": {
    id: "candidate-elimination",
    title: "Candidate Elimination",
    subtitle: "Core strategy — minimize expected remaining candidates",
    tier: "core",
    tierLabel: "Core greedy partition",
    localObjective: "Minimize expected remaining candidates after one guess (a one-step Bayes objective under a uniform candidate prior).",
    caveat:
      "Greedy. Leaving fewer candidates on average now is not the same as minimizing total expected guesses over the full decision tree.",
    overview: [
      "Candidate Elimination directly optimizes the quantity the solver most cares about after one step: how many candidates remain. For each allowed guess it partitions the candidate set by feedback pattern and chooses the guess whose expected remaining candidate count Σ n² / N is smallest.",
      "This is one of the cleanest one-ply objectives in the suite. Its local goal is exactly the expected size of the bucket the true answer lands in, under a uniform prior over remaining candidates — i.e., a one-step Bayes objective.",
    ],
    howItWorks: [
      "For each potential guess g, the strategy simulates every possible feedback pattern and groups candidates into buckets by pattern.",
      "The expected remaining count is computed as Σ n² / N: the probability-weighted average of bucket sizes. Each candidate in a bucket of size n has probability n/N of being the answer, and if so would leave n candidates — hence the squared term.",
      "The guess with the smallest expected remaining count wins. The Σ n² / N objective penalizes large buckets directly, so this strategy favors balanced partitions in a way that is closely related to (but not identical to) entropy maximization. Ties are broken first by worst-case bucket size, then alphabetically.",
    ],
    mathFormulas: [
      {
        label: "Partition",
        display: "S_p(g) = \\{w \\in C : \\text{feedback}(g, w) = p\\}",
        explanation:
          "S_p(g) is the set of candidates that would produce feedback pattern p when guess g is evaluated.",
      },
      {
        label: "Expected remaining",
        display: "\\mathbb{E}[\\text{remaining}(g)] = \\frac{\\sum_{p} |S_p(g)|^2}{|C|}",
        explanation:
          "The sum of squared bucket sizes divided by total candidates. This equals the expected size of the bucket the true answer lands in under a uniform candidate prior.",
      },
      {
        label: "Objective",
        display: "g^* = \\arg\\min_{g} \\; \\mathbb{E}[\\text{remaining}(g)]",
        explanation: "Select the guess that minimizes expected remaining candidates one step ahead.",
      },
    ],
    pseudocode: `function chooseGuess(candidates):
    best = null, bestER = inf
    for guess in candidates:
        counts = partitionCounts(guess, candidates)
        er = sum(n*n for n in counts.values()) / len(candidates)
        if er < bestER:
            best, bestER = guess, er
    return best`,
    strengths: [
      "Directly optimizes a principled one-step Bayes objective",
      "Intuitive interpretation — minimize the expected work left after this guess",
      "Competes closely with entropy in practice across standard mode",
      "Penalizes large buckets via the squared-count term",
    ],
    weaknesses: [
      "Greedy per-turn objective — may diverge from globally minimal expected guesses",
      "Squared-size weighting can undervalue rare-but-informative feedback patterns",
      "Does not model worst-case outcomes; vulnerable to adversarial feedback in Evil mode",
      "O(|allowed| × |candidates|) per turn — expensive relative to the baselines",
    ],
  },

  "expected-entropy": {
    id: "expected-entropy",
    title: "Expected Entropy",
    subtitle: "Core strategy — maximize Shannon information gain per guess",
    tier: "core",
    tierLabel: "Core greedy partition",
    localObjective: "Maximize Shannon entropy of the feedback-pattern distribution.",
    caveat:
      "Entropy is not the same as expected solve depth. A high-entropy guess can create subproblems that are awkward to resolve on later turns.",
    overview: [
      "Expected Entropy is the classic information-theoretic Wordle heuristic. Each guess is a question and each feedback pattern is an answer; the strategy picks the guess whose feedback distribution carries the most information, measured in bits.",
      "Although related, this is not equivalent to Candidate Elimination. Candidate Elimination minimizes Σ n² / N; Expected Entropy maximizes −Σ p log₂ p. Entropy rewards balanced partitions across many patterns more strongly than the squared-count term does, so the two strategies agree often but not always. Keeping both exposes the comparison between “minimize expected survivors” and “maximize expected information.”",
    ],
    howItWorks: [
      "For each potential guess, the strategy computes the probability distribution over all feasible feedback patterns (out of 3⁵ = 243 possible patterns).",
      "Shannon entropy of this distribution measures the expected information revealed. High entropy means the guess produces many roughly-equally-likely patterns, each one substantially narrowing the search space.",
      "The guess with the highest entropy wins. The upper bound for a single guess is log₂(|C|), achieved if every candidate lands in a unique bucket. In practice, strong opening guesses achieve around 5.8 bits on the canonical answer set. Ties are broken first by worst-case bucket size, then alphabetically.",
    ],
    mathFormulas: [
      {
        label: "Pattern probability",
        display: "P(p \\mid g) = \\frac{|S_p(g)|}{|C|}",
        explanation:
          "The probability of observing pattern p is the fraction of candidates that would produce it.",
      },
      {
        label: "Shannon entropy",
        display: "H(g) = -\\sum_{p} P(p \\mid g) \\log_2 P(p \\mid g)",
        explanation: "The expected information gain in bits. Higher entropy means more information per guess.",
      },
      {
        label: "Objective",
        display: "g^* = \\arg\\max_{g} \\; H(g)",
        explanation: "Select the guess that maximizes Shannon entropy of the feedback distribution.",
      },
      {
        label: "Information bound",
        display: "H(g) \\leq \\log_2(|C|)",
        explanation:
          "The maximum possible information equals log₂ of the candidate pool size — achieved only when each candidate maps to a unique feedback pattern.",
      },
    ],
    pseudocode: `function chooseGuess(candidates):
    best = null, bestH = -inf
    for guess in candidates:
        counts = partitionCounts(guess, candidates)
        total = len(candidates)
        H = -sum((n/total) * log2(n/total) for n in counts.values())
        if H > bestH:
            best, bestH = guess, H
    return best`,
    strengths: [
      "Principled information-theoretic objective",
      "Excellent average-case performance in standard mode",
      "Favors balanced, highly informative partitions",
      "One of the two canonical one-ply Wordle heuristics (alongside Candidate Elimination)",
    ],
    weaknesses: [
      "Greedy — not globally optimal over the full game tree",
      "High-entropy guesses can produce awkward late-game subproblems",
      "Average-case focused — large buckets are not penalized as directly as in Minimax",
      "O(|allowed| × |candidates|) per turn — expensive relative to the baselines",
    ],
  },

  minimax: {
    id: "minimax",
    title: "Minimax",
    subtitle: "Core strategy — minimize the worst-case surviving bucket",
    tier: "core",
    tierLabel: "Core greedy partition",
    localObjective: "Minimize the largest possible remaining candidate bucket after one guess.",
    caveat:
      "One-ply worst case. The true minimax-optimal policy is recursive: it minimizes future decision-tree depth, not just the immediate largest bucket.",
    overview: [
      "Minimax selects the guess whose largest possible surviving bucket is as small as possible. It is a one-ply worst-case heuristic.",
      "This is especially relevant for Evil mode, whose adversarial environment literally returns the largest-bucket pattern with deterministic tie-breaking. Minimax is the most natural one-ply strategy for that setting among the policies in this suite.",
    ],
    howItWorks: [
      "For each potential guess, partition candidates by feedback pattern (the same partition used by Expected Entropy and Candidate Elimination).",
      "Instead of averaging over the partition or computing entropy, take the single largest bucket — the worst-case outcome if the environment returns the least helpful feedback.",
      "Pick the guess whose largest bucket is smallest. This directly counters the adversary’s move in Evil mode. Ties are broken by alphabetical order over the guess string.",
    ],
    mathFormulas: [
      {
        label: "Worst-case bucket",
        display: "\\text{worst}(g) = \\max_{p} |S_p(g)|",
        explanation:
          "The size of the largest partition bucket — the most candidates that could remain after guess g in the worst case.",
      },
      {
        label: "Objective",
        display: "g^* = \\arg\\min_{g} \\; \\max_{p} |S_p(g)|",
        explanation: "Select the guess that minimizes the worst-case remaining candidates (the classic minimax criterion).",
      },
      {
        label: "Reduction ratio",
        display: "r(g) = 1 - \\frac{\\text{worst}(g)}{|C|}",
        explanation: "The fraction of candidates guaranteed to be eliminated even in the worst case.",
      },
    ],
    pseudocode: `function chooseGuess(candidates):
    best = null, bestWorst = inf
    for guess in candidates:
        counts = partitionCounts(guess, candidates)
        worst = max(counts.values())
        if worst < bestWorst:
            best, bestWorst = guess, worst
    return best`,
    strengths: [
      "Provides worst-case bucket-size bounds",
      "Most natural one-ply policy for Evil mode",
      "Robust — no catastrophically large surviving bucket after one guess",
      "Clear game-theoretic justification",
    ],
    weaknesses: [
      "Not globally minimax-optimal — the true optimum is recursive over the decision tree",
      "Sacrifices average-case performance in pursuit of worst-case bounds",
      "Overly pessimistic in standard mode, where the answer is fixed (not adversarial)",
      "Ignores highly informative guesses that happen to have one large bucket",
    ],
  },

  "posterior-hybrid": {
    id: "posterior-hybrid",
    title: "Posterior Hybrid",
    subtitle: "Experimental mode-aware heuristic — designed for Unknown mode",
    tier: "experimental",
    tierLabel: "Experimental mode-aware",
    localObjective:
      "Blend normalized standard-mode entropy with evil-mode worst-case reduction, weighted by the mode posterior.",
    caveat:
      "Heuristic blend — not the Bayes-optimal Unknown-mode policy. The two blended components are normalized to similar ranges but do not measure the same quantity, and the posterior-weighted combination is not derived from an optimality argument.",
    overview: [
      "Posterior Hybrid is a mode-aware heuristic for the Unknown mode, where the solver does not know whether the environment is standard (fixed answer) or evil (adversarial). It maintains a Bayesian posterior over the two modes and blends a standard-oriented entropy objective with an evil-oriented worst-case reduction objective using that posterior as weights.",
      "This strategy is experimental. It asks a useful benchmark question: does mode-aware play outperform strategies that ignore the possibility of Evil mode? It is not presented as an optimal Unknown-mode solver — the Bayes-optimal policy would reason recursively over future standard-consistent and evil-consistent branches, which this strategy does not do.",
    ],
    howItWorks: [
      "At each turn the solver tracks two candidate pools: standard-consistent and evil-consistent. The posterior P(mode | feedback) is computed with an asymmetric likelihood — the standard likelihood is the fraction of answers still consistent with observed feedback, while the evil likelihood is binary (1 if the feedback sequence could have been produced by an adversary, 0 otherwise).",
      "The standard component is Shannon entropy over the standard-consistent candidates, normalized by log₂(|C_std|) so it lies in [0, 1]. A singleton / empty standard pool falls back to 0 rather than NaN.",
      "The evil component is the reduction ratio 1 − max_bucket / |C_evil| on the evil-consistent candidates — the fraction of evil-consistent candidates guaranteed to be eliminated.",
      "The two scores are blended as P(std) · normalizedEntropy + P(evil) · reductionRatio. As feedback accumulates, the posterior typically concentrates on the true mode, so the blend naturally transitions from a hedged mix toward a single-mode specialist.",
    ],
    mathFormulas: [
      {
        label: "Mode posterior",
        display:
          "P(\\text{std} \\mid \\mathcal{F}) = \\frac{P(\\mathcal{F} \\mid \\text{std}) \\cdot P(\\text{std})}{P(\\mathcal{F} \\mid \\text{std}) \\cdot P(\\text{std}) + P(\\mathcal{F} \\mid \\text{evil}) \\cdot P(\\text{evil})}",
        explanation:
          "Bayes' rule updates the prior on each mode using the likelihood of the observed feedback sequence under each mode.",
      },
      {
        label: "Standard likelihood",
        display: "P(\\mathcal{F} \\mid \\text{std}) = \\frac{|C_{\\text{std}}|}{|\\mathcal{A}|}",
        explanation: "The fraction of all answer words still consistent with the observed feedback under standard rules.",
      },
      {
        label: "Evil likelihood (asymmetric)",
        display:
          "P(\\mathcal{F} \\mid \\text{evil}) = \\begin{cases} 1 & \\text{if feedback is consistent with evil play} \\\\ 0 & \\text{otherwise} \\end{cases}",
        explanation:
          "Unlike the standard likelihood (a fractional ratio), the evil likelihood is binary. The two likelihoods are on different scales — this asymmetry is intentional but drives posterior behavior that a fully Bayesian treatment would not produce.",
      },
      {
        label: "Normalized standard entropy",
        display: "\\hat{H}_{\\text{std}}(g) = H_{\\text{std}}(g) / \\log_2 |C_{\\text{std}}|",
        explanation:
          "Entropy normalized to [0, 1] so the blended score has a roughly comparable scale to the evil reduction ratio. Falls back to 0 when |C_std| ≤ 1 to avoid division by zero.",
      },
      {
        label: "Blended score",
        display:
          "\\text{score}(g) = P(\\text{std}) \\cdot \\hat{H}_{\\text{std}}(g) + P(\\text{evil}) \\cdot r_{\\text{evil}}(g)",
        explanation:
          "Posterior-weighted blend of normalized standard entropy and evil reduction ratio. The two components are on similar numeric scales but do not measure the same quantity — this is a practical hybrid, not a derived objective.",
      },
    ],
    pseudocode: `function chooseGuess(state):
    p_std = posterior.standard
    p_evil = posterior.evil
    max_H = log2(|state.standardCandidates|)  // guarded for |C| <= 1

    best = null, bestScore = -inf
    for guess in candidates:
        h  = shannonEntropy(partition(guess, state.standardCandidates)) / max_H
        r  = 1 - maxBucket(partition(guess, state.evilCandidates)) / |state.evilCandidates|
        score = p_std * h + p_evil * r
        if score > bestScore:
            best, bestScore = guess, score
    return best`,
    strengths: [
      "Explicitly uses the mode posterior — a meaningful benchmark for mode-aware play",
      "Blends information gain (good for Standard) with worst-case protection (good for Evil)",
      "Posterior naturally concentrates over time, letting the strategy specialize as evidence accrues",
      "Guards singleton and empty standard pools rather than failing with division-by-zero",
    ],
    weaknesses: [
      "Heuristic — not Bayes-optimal for the Unknown-mode expected-cost objective",
      "The blended components (normalized entropy vs. reduction ratio) are on similar scales but measure different quantities",
      "Using the posterior as a linear weight is intuitive, not derived from an optimality argument",
      "If the goal is to identify the true mode quickly, a diagnostic objective (e.g., maximizing disagreement between the two branches) would be more direct",
      "Most expensive strategy — evaluates both standard and evil partitions per guess",
    ],
  },

  "evil-shortest-path": {
    id: "evil-shortest-path",
    title: "Evil Shortest Path",
    subtitle: "Aggregate-aware — one-ply greedy minimizer of the evil-forced successor bucket",
    tier: "aggregate-aware",
    tierLabel: "Aggregate-aware (practical)",
    localObjective: "Minimize |T(C, g)| — the size of the evil-forced successor bucket under the benchmark's tie-break rules.",
    caveat:
      "One-ply greedy. Exact D(C) shortest-path requires recursive branch-and-bound with memoization over the deterministic evil subset graph — computationally prohibitive at Wordle scale. This strategy implements steps 1–3 of the spec's 'greedy/A* ordering' recipe and skips step 4 (recursive B&B).",
    overview: [
      "Evil Shortest Path targets the spec's deterministic Evil-mode decision rule D(C): the minimum number of additional guesses needed to reach terminal when the adversary returns the benchmark's forced bucket at every step. Because each guess has exactly one forced successor, the evil subset graph is deterministic and an optimum exists; finding it exactly requires recursive search, but the greedy one-step rule is a strong practical approximation that is directly aligned with the adversary's move.",
      "At each state, the strategy picks the guess whose forced successor |T(C, g)| is smallest. Tie-breakers favor higher Shannon entropy (so non-evil branches also split well if the adversary is beaten) and then lexicographic order over the guess string.",
    ],
    howItWorks: [
      "Compute the feedback partition for every allowed guess g against the current candidate set C. Within each partition, identify the forced bucket under the benchmark tie-break rule: largest size, fewest greens, fewest yellows, lexicographically smallest pattern digits.",
      "|T(C, g)| is the size of that forced bucket. Pick the guess minimizing this size. Because Evil mode literally returns this bucket at the next step, the chosen guess directly shrinks the worst-case branch the adversary will force.",
      "In Standard or Unknown mode, the same local objective still shrinks the worst-case branch, but other strategies (Candidate Elimination, Posterior Expectimax) better target those aggregate metrics.",
    ],
    mathFormulas: [
      {
        label: "Evil-forced pattern",
        display:
          "e(C, g) = \\arg\\max_r \\big(|B_r(C, g)|,\\; -\\text{greens}(r),\\; -\\text{yellows}(r),\\; -\\text{lex}(r)\\big)",
        explanation:
          "The adversary's deterministic tie-break rule: largest bucket first, then fewest greens, fewest yellows, lex-smallest pattern digits. This matches the EvilEnvironment implementation exactly.",
      },
      {
        label: "Forced successor",
        display: "T(C, g) = B_{e(C, g)}(C, g)",
        explanation: "The candidate subset that survives after the adversary returns the forced pattern.",
      },
      {
        label: "Greedy objective",
        display: "g^* = \\arg\\min_{g \\in G} \\; |T(C, g)|",
        explanation: "One-ply approximation of D(C). The exact recurrence is D(C) = min_g [1 + D(T(C, g))] with D({}) = 0.",
      },
    ],
    pseudocode: `function chooseGuess(candidates):
    best = null, bestForced = inf, bestEntropy = -inf
    for guess in allAllowed:
        counts = partitionCounts(guess, candidates)
        forced = evilForcedBucketSize(counts)   // largest bucket, benchmark tie-break
        entropy = shannonEntropy(counts)
        if forced < bestForced
           or (forced == bestForced and entropy > bestEntropy)
           or (forced == bestForced and entropy == bestEntropy and guess < best):
            best, bestForced, bestEntropy = guess, forced, entropy
    return best`,
    strengths: [
      "Directly aligned with the Evil-mode adversary — it minimizes the bucket the environment returns",
      "Tractable at Wordle scale — one O(|G| × |C|) partition pass per decision",
      "Entropy tie-breaker helps non-evil branches when the adversary is beaten",
      "Concrete realization of the spec's practical Evil-mode candidate",
    ],
    weaknesses: [
      "Not exact — the true D(C) requires recursive search over the evil subset graph",
      "Does not target aggregate metrics directly in Standard mode (prefer Candidate Elimination there)",
      "Greedy can get trapped: a guess with a slightly larger forced bucket can unlock a much shorter future path",
      "Evaluates every allowed guess per decision — one of the more expensive policies",
    ],
  },

  "posterior-expectimax": {
    id: "posterior-expectimax",
    title: "Posterior Expectimax",
    subtitle: "Aggregate-aware — one-step Bayesian expectimax for Unknown mode",
    tier: "aggregate-aware",
    tierLabel: "Aggregate-aware (practical)",
    localObjective: "Minimize q · E[|C_next|] + (1 − q) · |T(C, g)|, with both terms in units of remaining candidates.",
    caveat:
      "Depth-1 expectimax. The spec's Bayesian limited-depth expectimax propagates value estimates recursively; this strategy truncates at depth 1 and approximates leaf values with the one-step Bayes objectives for each mode.",
    overview: [
      "Posterior Expectimax is the practical candidate algorithm from the Unknown-mode section of the spec. It scores each guess as the posterior-weighted average of two one-step cost estimates: the standard-mode expected remaining candidates (the Candidate Elimination objective) and the evil-forced successor size (the Evil Shortest Path objective).",
      "Unlike the earlier Posterior Hybrid, both components of the blended score live in the same units — remaining candidates — so the posterior-weighted average is dimensionally coherent and reduces cleanly to the mode-specific objective when the posterior concentrates on one mode.",
    ],
    howItWorks: [
      "Read the mode posterior q from the current snapshot: q = 1 in Standard, 0 in Evil, and P(standard | history) in Unknown mode (matching the engine's closed-form posterior).",
      "For each allowed guess g, compute two quantities from the same feedback partition: Σ |B_r|² / |C| (expected remaining candidates under standard mode) and |T(C, g)| (forced bucket size under evil mode).",
      "Blend with the posterior: score(g) = q · Σ|B_r|²/|C| + (1 − q) · |T(C, g)|. Pick the argmin. In Standard (q = 1) this reduces to Candidate Elimination; in Evil (q = 0) it reduces to Evil Shortest Path; in Unknown it interpolates smoothly between the two.",
    ],
    mathFormulas: [
      {
        label: "Expected remaining (standard)",
        display: "\\mathbb{E}[|C_{\\text{next}}| \\mid g, \\text{standard}] = \\frac{\\sum_p |B_p(C, g)|^2}{|C|}",
        explanation: "The one-step Bayes objective under a uniform standard prior. Same quantity Candidate Elimination minimizes.",
      },
      {
        label: "Forced successor size (evil)",
        display: "|T(C, g)| = |B_{e(C, g)}(C, g)|",
        explanation: "Size of the adversary's forced bucket — the candidate set after one evil turn.",
      },
      {
        label: "Blended score",
        display: "\\text{score}(g) = q \\cdot \\mathbb{E}[|C_{\\text{next}}|] + (1 - q) \\cdot |T(C, g)|",
        explanation:
          "Posterior-weighted average. Both terms are in 'remaining candidates' units, so the blend is dimensionally coherent.",
      },
      {
        label: "Objective",
        display: "g^* = \\arg\\min_{g \\in G} \\; \\text{score}(g)",
        explanation:
          "Depth-1 expectimax. A full expectimax would recursively propagate value estimates over future branches; this strategy truncates at depth 1.",
      },
    ],
    pseudocode: `function chooseGuess(state):
    q     = state.modePosterior.standard   // or closed-form |C_std|/(N+|C_std|)
    w_e   = 1 - q

    best = null, bestScore = inf
    for guess in allAllowed:
        counts   = partitionCounts(guess, state.candidates)
        expected = sum(n*n for n in counts.values()) / len(state.candidates)
        forced   = evilForcedBucketSize(counts)
        score    = q * expected + w_e * forced
        if score < bestScore:
            best, bestScore = guess, score
    return best`,
    strengths: [
      "Dimensionally coherent — both blended terms are in 'remaining candidates' units",
      "Reduces exactly to Candidate Elimination (Standard) and Evil Shortest Path (Evil) at the posterior extremes",
      "Uses the engine's closed-form posterior rather than a heuristic blend coefficient",
      "Depth-1 is tractable at Wordle scale while still being mode-aware",
    ],
    weaknesses: [
      "Depth-1 truncation — true expectimax propagates values recursively",
      "Leaf approximation (E[|C_next|], |T(C,g)|) is a proxy for expected future solve cost, not the cost itself",
      "Standard component does not penalize large worst-case buckets as aggressively as Minimax",
      "Evaluates every allowed guess per decision",
    ],
  },

  "robust-scalarization": {
    id: "robust-scalarization",
    title: "Robust Scalarization",
    subtitle: "Aggregate-aware — minimax over modes on a shared feedback history",
    tier: "aggregate-aware",
    tierLabel: "Aggregate-aware (practical)",
    localObjective: "Minimize max(E[|C_next|], |T(C, g)|) — the worst one-step cost across standard and evil modes.",
    caveat:
      "One-step scalarization. The spec's true robust policy optimizes over Pareto frontiers of achievable cost triples across modes and histories, which is exponential in the reachable state space. This strategy approximates with a single-step max over the two mode-specific objectives.",
    overview: [
      "Robust Scalarization is the practical candidate from the cross-mode robustness section of the spec. It computes, for each guess, two one-step cost estimates (standard-mode expected remaining candidates and evil-forced bucket size) and picks the guess minimizing the larger of the two.",
      "The intent is to bound the worst-case one-step cost across mode uncertainty without specializing to either mode. This matters when the benchmark metric is robustness spread (max_m J_m − min_m J_m): a guess that is catastrophic in one mode will lose this selection even if it looks great in another.",
    ],
    howItWorks: [
      "Partition the candidate set by feedback pattern for each allowed guess.",
      "Compute two one-step cost estimates: J_standard(g) = Σ |B_r|² / |C| (standard-mode expected survivors) and J_evil(g) = |T(C, g)| (evil-forced successor size).",
      "Score each guess by max(J_standard, J_evil) — the worse of the two modes. Ties break by mean cost (J_standard + J_evil) / 2, then lexicographic order.",
    ],
    mathFormulas: [
      {
        label: "Standard cost",
        display: "J_{\\text{std}}(g) = \\frac{\\sum_p |B_p(C, g)|^2}{|C|}",
        explanation: "Expected remaining candidates under the standard-mode uniform prior.",
      },
      {
        label: "Evil cost",
        display: "J_{\\text{evil}}(g) = |T(C, g)|",
        explanation: "Evil-forced successor size — the candidate set after one adversarial turn.",
      },
      {
        label: "Robust scalarization",
        display: "g^* = \\arg\\min_{g \\in G} \\; \\max\\big(J_{\\text{std}}(g),\\; J_{\\text{evil}}(g)\\big)",
        explanation:
          "Minimax over modes. Both costs are in 'remaining candidates' units, so the max is well-defined on the same scale.",
      },
      {
        label: "Robustness spread",
        display:
          "\\text{spread}(\\pi) = \\max_m J_m(\\pi) - \\min_m J_m(\\pi)",
        explanation:
          "The aggregate metric this strategy approximates one step at a time. As a standalone objective it is degenerate (constant-bad strategies have spread 0); the benchmark lexicographically combines it with mean penalized average.",
      },
    ],
    pseudocode: `function chooseGuess(state):
    best = null, bestMax = inf, bestMean = inf
    for guess in allAllowed:
        counts   = partitionCounts(guess, state.candidates)
        std_cost = sum(n*n for n in counts.values()) / len(state.candidates)
        evil     = evilForcedBucketSize(counts)
        robust   = max(std_cost, evil)
        mean     = 0.5 * (std_cost + evil)
        if robust < bestMax or (robust == bestMax and mean < bestMean):
            best, bestMax, bestMean = guess, robust, mean
    return best`,
    strengths: [
      "Targets the benchmark's robustness-spread metric one step at a time",
      "Bounded one-step cost under either mode — no catastrophic mode-specific failures",
      "Simple, dimensionally coherent: both components are remaining-candidates counts",
      "Useful comparator for the Unknown-mode strategies",
    ],
    weaknesses: [
      "One-step scalarization — true robust optimum requires recursive Pareto-frontier search",
      "Max-over-modes can be pessimistic when one mode dominates in practice",
      "Does not exploit the posterior: a strategy explicitly Bayesian (Posterior Expectimax) may dominate when the mode is nearly determined",
      "Evaluates every allowed guess per decision",
    ],
  },

  "evil-dp": {
    id: "evil-dp",
    title: "Evil DP",
    subtitle: "Optimal (where tractable) — memoized shortest-path DP for Evil mode",
    tier: "optimal",
    tierLabel: "Optimal (where tractable)",
    localObjective: "D(C) = min_g [1 + D(T(C, g))] — the exact shortest-path recurrence over the deterministic evil subset graph.",
    caveat:
      "Evil mode only. Python implementation uses a beam of K=100 over the best forced-bucket guesses at each node; this reproduces the published optimum on the canonical list. The in-memory policy is persisted to disk (≈524KB JSON) so only the first run pays the ~80s solve cost. Browser clients fall back to the greedy evil-shortest-path objective.",
    overview: [
      "Evil DP computes the spec's exact D(C) recurrence for Evil mode. Because each guess has a single deterministic forced successor T(C, g), the subset graph reachable from the canonical answer set has only a few thousand nodes — small enough for memoized DFS in pure Python, unlike Standard mode where branching successors explode the state space. The broader picture (theoretical bounds, why Standard/Unknown DP is prohibitive in Python, published optima from Bertsimas & Paskov 2022 and Selby 2022) is documented in docs/dp-methods.md.",
      "At Wordle scale the engine uses a beam of K=100 guesses per node (sorted by forced-bucket size, then entropy) plus successor-dedup and simple lower-bound pruning. On the canonical 2,315-answer list this finds D(A) = 4 turns — one full guess better than every greedy strategy, which tie at 5. The opening is 'raise'.",
      "In Standard and Unknown modes, exact DP is not tractable in pure Python, so the strategy falls back to the one-ply evil-forced-bucket greedy from the Evil Shortest Path strategy. The benchmark run records a 'fallback' flag in those cases so the distinction stays visible.",
    ],
    howItWorks: [
      "On the first Evil-mode decision, the strategy checks a JSON cache at results/cache/evil-dp-k100-n2315.json. Cache miss triggers a memoized DFS from the full answer set: for each candidate subset C, evaluate the top-K guesses sorted by forced-bucket size, compute each T(C, g), recurse on unique successors, and record (depth, best guess) for C.",
      "Lower-bound pruning: once we have a best_depth, any guess whose forced-bucket size implies a lower bound ≥ best_depth is skipped (sorted order makes this a clean break). Successor dedup: two guesses producing the same T are equivalent; only the first is recursed on.",
      "Subsequent decisions are O(1) lookups on the cached policy keyed on the current candidate set. Off-policy states (rare — possible only if environment tie-breaks drift) are solved on demand.",
    ],
    mathFormulas: [
      {
        label: "Evil-mode DP",
        display:
          "D(C) = \\min_{g \\in G}\\big[\\,1 + D(T(C, g))\\,\\big] \\quad \\text{with} \\quad D(\\{w\\}) = 1",
        explanation:
          "Each guess has exactly one successor T(C, g) — the bucket the adversary forces. Terminal state is a singleton, solved in one more guess.",
      },
      {
        label: "Beam-limited minimum",
        display:
          "D_K(C) = \\min_{g \\in \\text{top-}K(C)}\\big[\\,1 + D_K(T(C, g))\\,\\big]",
        explanation:
          "Top-K by forced-bucket size (ties broken by entropy). K=100 recovers the exact optimum on the canonical list in published results.",
      },
      {
        label: "Lower-bound prune",
        display:
          "|T(C, g)| = 1 \\Rightarrow \\text{depth} = 2; \\quad |T(C, g)| \\ge 2 \\Rightarrow \\text{depth} \\ge 3",
        explanation:
          "In sorted order over forced-bucket size, break once the best case for the remaining guesses meets or exceeds the current best depth.",
      },
    ],
    pseudocode: `function solve(C):
    if len(C) == 1: return (1, sole member)
    if C in policy: return policy[C]

    # Score every allowed guess by forced-bucket size under evil tie-breaks.
    scored = sortByForcedBucket(allowedGuesses, C)
    scored = scored[:K]                     // beam cap

    seenSuccessors = {}, bestDepth = inf, bestGuess = null
    for (forcedSize, forcedPattern, guess) in scored:
        lb = 2 if forcedSize == 1 else 3
        if lb >= bestDepth: break           // sorted: no later guess can improve

        T = {w in C : score(guess, w) == forcedPattern}
        if T in seenSuccessors: continue
        seenSuccessors.add(T)

        (subDepth, _) = solve(T)
        if 1 + subDepth < bestDepth:
            bestDepth, bestGuess = 1 + subDepth, guess
            if bestDepth == 2: break        // unbeatable

    policy[C] = (bestDepth, bestGuess)
    return policy[C]`,
    strengths: [
      "Finds the true Evil-mode optimum on the canonical list (D = 4, vs 5 for every greedy strategy)",
      "First-run cost (~80s) is paid once and persisted; subsequent runs reload instantly",
      "Beam=100 + successor-dedup + lower-bound prune keep the search tree tractable in pure Python",
      "Fallback for Standard/Unknown modes is honest about the switch (recorded in the decision explanation)",
    ],
    weaknesses: [
      "Optimal only for Evil mode — Standard and Unknown fall back to one-ply greedy",
      "Beam-limited (K=100); unbounded exhaustive search would be needed for a provably exact guarantee, though beam=100 matches published exact results on the canonical list",
      "Policy size (~524KB JSON) is shipped only to the Python engine, not to browser clients",
      "First-run cost is noticeable (~80s); CI-style benchmarks should commit or warm the cache",
    ],
  },
};

export const STRATEGY_IDS = Object.keys(STRATEGY_CONTENT);

export const STRATEGIES_BY_TIER: Record<StrategyTier, string[]> = STRATEGY_IDS.reduce(
  (acc, id) => {
    const tier = STRATEGY_CONTENT[id].tier;
    acc[tier].push(id);
    return acc;
  },
  { baseline: [], core: [], experimental: [], "aggregate-aware": [], optimal: [] } as Record<StrategyTier, string[]>,
);

export const TIER_ORDER: StrategyTier[] = ["baseline", "core", "experimental", "aggregate-aware", "optimal"];

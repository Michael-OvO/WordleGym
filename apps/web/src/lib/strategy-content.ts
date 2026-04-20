export type StrategySection = {
  id: string;
  title: string;
  subtitle: string;
  overview: string[];
  howItWorks: string[];
  mathFormulas: { label: string; display: string; explanation: string }[];
  pseudocode: string;
  strengths: string[];
  weaknesses: string[];
};

export const STRATEGY_CONTENT: Record<string, StrategySection> = {
  "random-valid": {
    id: "random-valid",
    title: "Random Valid",
    subtitle: "Baseline strategy — deterministic seeded random play over feasible answers",
    overview: [
      "The Random Valid strategy serves as our performance baseline. It makes no attempt to optimize information gain or minimize worst-case outcomes. Instead, it deterministically selects a random word from the current candidate pool using a seeded hash of the game state.",
      "Despite its simplicity, this strategy always selects a word that is consistent with all observed feedback — it never wastes a guess on an impossible answer. This makes it a useful lower bound for comparing more sophisticated strategies.",
    ],
    howItWorks: [
      "At each turn, the strategy computes a deterministic hash from the current game state — specifically, the sequence of guesses and feedback patterns observed so far. This hash is converted to a numeric seed.",
      "The seed indexes into the current candidate pool (words still consistent with all feedback). Because the hash is deterministic, the same game state always produces the same guess, making results reproducible across runs.",
      "The candidate pool shrinks each turn as feedback eliminates inconsistent words, but the strategy makes no effort to choose guesses that maximize this shrinkage.",
    ],
    mathFormulas: [
      {
        label: "Seed derivation",
        display: "\\text{seed} = \\text{hash}(s_1, f_1, s_2, f_2, \\ldots)",
        explanation: "A deterministic hash of the game history (guesses and feedback patterns). The Python engine uses SHA-1 with the first 12 hex digits as a seed; the browser client uses a polynomial rolling hash for performance.",
      },
      {
        label: "Guess selection",
        display: "g_t = C[\\text{seed} \\mod |C|]",
        explanation: "The seed modulo the candidate pool size selects the guess. C is the pool of words consistent with all prior feedback.",
      },
    ],
    pseudocode: `function chooseGuess(candidates, gameHistory):
    seed = hash(gameHistory)
    index = seed mod len(candidates)
    return candidates[index]`,
    strengths: [
      "Zero computational cost — no scoring or ranking needed",
      "Deterministic and reproducible via hash seeding",
      "Always selects a valid candidate (never wastes a guess)",
      "Useful baseline for measuring strategy improvement",
    ],
    weaknesses: [
      "Makes no use of information theory or optimization",
      "Expected performance is significantly worse than all other strategies",
      "Worst-case performance can be very poor (8+ guesses)",
      "No adaptability to game mode (standard, evil, unknown)",
    ],
  },

  "letter-frequency": {
    id: "letter-frequency",
    title: "Letter Frequency",
    subtitle: "Heuristic strategy — maximize weighted letter coverage across candidate pool",
    overview: [
      "The Letter Frequency strategy scores each potential guess by how well its letters cover the distribution of letters in the remaining candidate pool. It combines two signals: positional frequency (how often each letter appears at each specific position) and global frequency (how common each unique letter is across all candidates).",
      "This is a fast heuristic that avoids the expensive partition computation required by information-theoretic strategies. It performs surprisingly well in practice, often approaching entropy-based methods in average guesses while running orders of magnitude faster.",
    ],
    howItWorks: [
      "First, the strategy builds two frequency tables from the current candidate pool. The positional table counts how often each letter appears at each of the 5 positions. The global table counts the number of candidates containing each letter (counting each letter once per word, not per occurrence).",
      "For each potential guess, the positional score sums the positional frequency of each letter at its position. The global score sums the global frequency of each unique letter in the guess. Repeated letters are counted only once in the global score to avoid biasing toward words with duplicate letters.",
      "The final score combines both signals: the positional score plus 0.4 times the global score. The 0.4 weight was tuned empirically to balance position-specific and general letter coverage. The highest-scoring word is selected, with alphabetical order breaking ties.",
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
        display: "\\text{score}(g) = \\sum_{i=0}^{4} f_{\\text{pos}}(g_i, i) + 0.4 \\sum_{c \\in \\text{unique}(g)} f_{\\text{global}}(c)",
        explanation: "The positional contribution dominates, while the global term rewards letters that appear frequently anywhere in the candidate pool.",
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
      "Very fast — no partition computation needed (linear in candidate pool size)",
      "Good empirical performance despite theoretical simplicity",
      "Balances position-specific and general letter coverage",
      "Works well in early game when the candidate pool is large",
    ],
    weaknesses: [
      "No information-theoretic guarantees on optimality",
      "Does not consider how feedback patterns will partition the candidate pool",
      "The 0.4 global weight is empirically tuned, not derived",
      "May make suboptimal choices in the late game when few candidates remain",
    ],
  },

  "candidate-elimination": {
    id: "candidate-elimination",
    title: "Candidate Elimination",
    subtitle: "Partition strategy — minimize the expected number of remaining candidates",
    overview: [
      "The Candidate Elimination strategy directly targets the quantity we care about: how many candidates will remain after a guess. For each potential guess, it computes the expected number of remaining candidates across all possible feedback patterns, then selects the guess that minimizes this expectation.",
      "This strategy belongs to the family of partition-based methods. Each guess partitions the candidate pool into buckets based on the feedback pattern that would result. The expected remaining candidates is the sum of squared bucket sizes divided by the total — a direct measure of how well the guess splits the pool.",
    ],
    howItWorks: [
      "For each potential guess g, the strategy simulates every possible feedback pattern against every remaining candidate. This creates a partition: candidates are grouped by which feedback pattern they would produce.",
      "The expected remaining count is computed as the probability-weighted average of bucket sizes. Because each candidate in a bucket of size n has probability n/N of being the answer, and would leave n candidates remaining, the expected value is Σ(n²)/N.",
      "The guess with the smallest expected remaining candidates wins. This objective favors guesses that create balanced partitions — many small buckets rather than a few large ones. Ties are broken alphabetically.",
    ],
    mathFormulas: [
      {
        label: "Partition",
        display: "S_p(g) = \\{w \\in C : \\text{feedback}(g, w) = p\\}",
        explanation: "Sp(g) is the set of candidates that would produce feedback pattern p when guess g is evaluated.",
      },
      {
        label: "Expected remaining",
        display: "\\mathbb{E}[\\text{remaining}(g)] = \\frac{\\sum_{p} |S_p(g)|^2}{|C|}",
        explanation: "The sum of squared bucket sizes divided by total candidates. This equals the expected size of the bucket the true answer lands in.",
      },
      {
        label: "Objective",
        display: "g^* = \\arg\\min_{g} \\; \\mathbb{E}[\\text{remaining}(g)]",
        explanation: "Select the guess that minimizes expected remaining candidates.",
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
      "Directly optimizes the quantity we care about (remaining candidates)",
      "Intuitive interpretation — minimizes expected work remaining",
      "Performs well in practice across all game modes",
      "Favors balanced partitions naturally",
    ],
    weaknesses: [
      "Computationally expensive — must evaluate all words against all candidates",
      "Squared-size weighting can undervalue rare but highly informative patterns",
      "No theoretical guarantee of optimality (greedy, not dynamic programming)",
      "Does not account for worst-case scenarios (vulnerable to adversarial feedback)",
    ],
  },

  "expected-entropy": {
    id: "expected-entropy",
    title: "Expected Entropy",
    subtitle: "Information-theoretic strategy — maximize Shannon information gain per guess",
    overview: [
      "The Expected Entropy strategy is grounded in Shannon's information theory. It treats each guess as a question asked to the environment, and each feedback pattern as an answer that reveals information about the hidden word. The strategy selects the guess that maximizes expected information gain — measured in bits.",
      "This is arguably the most principled approach to Wordle. The Shannon entropy of a partition measures the average surprise of observing a feedback pattern. Maximizing entropy is equivalent to maximizing the expected reduction in uncertainty about the hidden word.",
    ],
    howItWorks: [
      "For each candidate guess, the strategy computes the probability distribution over all 243 possible feedback patterns (3⁵ = 243, since each of 5 positions can be absent, present, or correct).",
      "The Shannon entropy of this distribution measures how much information the guess is expected to reveal. High entropy means the guess produces many roughly-equally-likely patterns — each one substantially narrows the search space.",
      "The maximum possible entropy for a single guess is log₂(243) ≈ 7.93 bits — achieved when all 243 patterns are equally likely. In practice, a good opening guess achieves around 5.8 bits.",
      "The strategy greedily maximizes entropy at each turn. While this does not guarantee a globally optimal game tree (that would require dynamic programming over all possible future branches), it performs extremely well in practice.",
    ],
    mathFormulas: [
      {
        label: "Pattern probability",
        display: "P(p \\mid g) = \\frac{|S_p(g)|}{|C|}",
        explanation: "The probability of observing pattern p equals the fraction of remaining candidates that would produce that pattern.",
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
        explanation: "The maximum possible information equals the log of the candidate pool size — achieved when each candidate maps to a unique pattern.",
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
      "Grounded in information theory with clear theoretical justification",
      "Maximizes expected information gain per guess",
      "Excellent average-case performance (often the best strategy for standard mode)",
      "Naturally favors guesses that create balanced, informative partitions",
    ],
    weaknesses: [
      "Greedy (per-turn) optimization — not globally optimal over the full game tree",
      "Computationally expensive — O(|candidates|²) per turn",
      "Average-case focus can leave worst-case scenarios unprotected",
      "Vulnerable to adversarial feedback (evil mode) which targets the largest bucket",
    ],
  },

  "minimax": {
    id: "minimax",
    title: "Minimax",
    subtitle: "Adversarial strategy — minimize the worst-case number of remaining candidates",
    overview: [
      "The Minimax strategy takes a pessimistic, adversarial view. Instead of optimizing for the average case, it assumes the environment will always give the worst possible feedback — the pattern that leaves the most candidates remaining. It then selects the guess that minimizes this worst case.",
      "This strategy is inspired by game-theoretic minimax reasoning. If Wordle were played against an adversary (as it is in Evil mode), minimax would be the optimal strategy for guaranteeing the fewest possible remaining candidates in the worst scenario.",
    ],
    howItWorks: [
      "For each potential guess, the strategy partitions candidates by feedback pattern (just like entropy and candidate elimination). But instead of computing an average or entropy over the partition, it looks at the single largest bucket — the worst-case outcome.",
      "The largest bucket represents what happens if the environment provides the least helpful feedback. The minimax strategy selects the guess whose largest bucket is smallest — minimizing the damage from the worst case.",
      "This is particularly powerful in Evil mode, where the adversarial environment literally selects the pattern corresponding to the largest bucket. Minimax directly counters this by making all large buckets as small as possible.",
    ],
    mathFormulas: [
      {
        label: "Worst-case bucket",
        display: "\\text{worst}(g) = \\max_{p} |S_p(g)|",
        explanation: "The size of the largest partition bucket — the most candidates that could remain after guess g in the worst case.",
      },
      {
        label: "Objective",
        display: "g^* = \\arg\\min_{g} \\; \\max_{p} |S_p(g)|",
        explanation: "Select the guess that minimizes the worst-case remaining candidates. This is the classic minimax criterion.",
      },
      {
        label: "Reduction ratio",
        display: "r(g) = 1 - \\frac{\\text{worst}(g)}{|C|}",
        explanation: "The fraction of candidates guaranteed to be eliminated, even in the worst case.",
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
      "Guarantees worst-case performance bounds",
      "Optimal against adversarial environments (Evil mode)",
      "Robust — never has catastrophically bad outcomes",
      "Clear game-theoretic justification",
    ],
    weaknesses: [
      "Sacrifices average-case performance for worst-case guarantees",
      "Overly pessimistic in standard mode where the answer is fixed, not adversarial",
      "May ignore highly informative guesses that happen to have one large bucket",
      "Computationally expensive — same O(|candidates|²) as other partition methods",
    ],
  },

  "adaptive-robust": {
    id: "adaptive-robust",
    title: "Adaptive Robust",
    subtitle: "Bayesian hybrid — blend entropy and minimax objectives weighted by mode posterior",
    overview: [
      "The Adaptive Robust strategy is designed for the Unknown mode, where the solver does not know whether the environment is standard (fixed answer) or evil (adversarial). It maintains a Bayesian posterior probability over the two possible modes, and blends the entropy (good for standard) and minimax (good for evil) objectives according to this posterior.",
      "This is the most sophisticated strategy in the system. It adapts its behavior in real-time: when the posterior favors standard mode, it prioritizes information gain; when it favors evil mode, it shifts toward worst-case protection. This allows it to perform well regardless of which mode the environment actually uses.",
    ],
    howItWorks: [
      "At each turn, the strategy maintains two candidate pools — one for standard-mode consistency and one for evil-mode consistency. The Bayesian posterior P(mode | observations) is computed using an asymmetric likelihood model: the standard likelihood is the fraction of answers consistent with observed feedback, while the evil likelihood is binary (1 if the feedback sequence could have been produced by an adversary, 0 otherwise).",
      "The standard component computes Shannon entropy on the standard-consistent candidates. The evil component computes the reduction ratio (1 - worst_case/total) on the evil-consistent candidates.",
      "These two scores are blended using the mode posterior as weights. If P(standard) = 0.7 and P(evil) = 0.3, the final score is 0.7 × entropy + 0.3 × reduction_ratio.",
      "As the game progresses and more feedback is observed, the posterior typically converges toward the true mode. This means the strategy naturally transitions from a hedged blend to a mode-specific specialist.",
    ],
    mathFormulas: [
      {
        label: "Mode posterior",
        display: "P(\\text{std} \\mid \\mathcal{F}) = \\frac{P(\\mathcal{F} \\mid \\text{std}) \\cdot P(\\text{std})}{P(\\mathcal{F} \\mid \\text{std}) \\cdot P(\\text{std}) + P(\\mathcal{F} \\mid \\text{evil}) \\cdot P(\\text{evil})}",
        explanation: "Bayes' rule updates the prior probability of each mode using the likelihood of the observed feedback sequence under each mode.",
      },
      {
        label: "Standard likelihood",
        display: "P(\\mathcal{F} \\mid \\text{std}) = \\frac{|C_{\\text{std}}|}{|\\mathcal{A}|}",
        explanation: "The fraction of all answer words that are consistent with the observed feedback under standard mode rules.",
      },
      {
        label: "Evil likelihood",
        display: "P(\\mathcal{F} \\mid \\text{evil}) = \\begin{cases} 1 & \\text{if feedback is consistent with evil play} \\\\ 0 & \\text{otherwise} \\end{cases}",
        explanation: "Unlike the standard likelihood (a fractional ratio), the evil likelihood is binary. Any feedback sequence that an adversary could have produced is equally likely under evil mode, while an impossible sequence has zero likelihood. This asymmetry drives the posterior update.",
      },
      {
        label: "Blended score",
        display: "\\text{score}(g) = P(\\text{std}) \\cdot H_{\\text{std}}(g) + P(\\text{evil}) \\cdot r_{\\text{evil}}(g)",
        explanation: "The final score blends Shannon entropy (for standard mode) with evil-mode reduction ratio, weighted by the current posterior.",
      },
      {
        label: "Evil reduction",
        display: "r_{\\text{evil}}(g) = 1 - \\frac{\\max_p |S_p^{\\text{evil}}(g)|}{|C_{\\text{evil}}|}",
        explanation: "The guaranteed fraction of evil-consistent candidates eliminated. Higher is better for adversarial robustness.",
      },
    ],
    pseudocode: `function chooseGuess(state):
    p_std = computePosterior(state)
    p_evil = 1 - p_std

    best = null, bestScore = -inf
    for guess in candidates:
        std_counts = partition(guess, state.stdCandidates)
        evil_counts = partition(guess, state.evilCandidates)

        h = shannonEntropy(std_counts)
        r = 1 - max(evil_counts) / len(state.evilCandidates)

        score = p_std * h + p_evil * r
        if score > bestScore:
            best, bestScore = guess, score
    return best`,
    strengths: [
      "Adapts to unknown environments via Bayesian inference",
      "Blends information gain (standard) with worst-case protection (evil)",
      "Posterior naturally converges — becomes a specialist as evidence accumulates",
      "Best strategy for Unknown mode where the game mode is hidden",
    ],
    weaknesses: [
      "Most computationally expensive — evaluates both standard and evil partitions",
      "Posterior estimation can be noisy in early turns with limited evidence",
      "Blending coefficient (posterior) may not be the optimal interpolation",
      "Dual candidate pool tracking adds complexity and memory overhead",
    ],
  },
};

export const STRATEGY_IDS = Object.keys(STRATEGY_CONTENT);

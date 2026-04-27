export type Mode = "standard" | "evil" | "unknown";
export type HiddenMode = "standard" | "evil";
export type Posterior = { standard: number; evil: number };

export type WordLists = {
  answers: string[];
  allowed: string[];
};

export type DecisionExplanation = Record<string, unknown>;

export type GameStep = {
  turn: number;
  guess: string;
  pattern: number;
  patternText: string;
  patternEmoji: string;
  remainingCandidates: number;
  candidatePreview: string[];
  explanation?: DecisionExplanation;
  modePosterior?: Posterior;
  standardCandidates?: number;
  evilCandidates?: number;
};

export type GameState = {
  mode: Mode;
  hiddenMode: HiddenMode;
  hiddenAnswer: string | null;
  priorEvil: number;
  guesses: string[];
  feedbacks: number[];
  steps: GameStep[];
  candidateWords: string[];
  standardCandidateWords: string[];
  evilCandidateWords: string[];
  modePosterior: Posterior;
  solved: boolean;
  exhausted: boolean;
  maxTurns: number | null;
  wordLists: WordLists;
};

const ALL_CORRECT_PATTERN = 242;

export function encodePattern(states: number[]): number {
  return states.reduce((total, state, index) => total + state * 3 ** index, 0);
}

export function decodePattern(pattern: number): number[] {
  const digits: number[] = [];
  let remainder = pattern;
  for (let index = 0; index < 5; index += 1) {
    digits.push(remainder % 3);
    remainder = Math.floor(remainder / 3);
  }
  return digits;
}

export function patternToText(pattern: number): string {
  return decodePattern(pattern)
    .map((value) => (value === 2 ? "G" : value === 1 ? "Y" : "B"))
    .join("");
}

export function patternToEmoji(pattern: number): string {
  return decodePattern(pattern)
    .map((value) => (value === 2 ? "🟩" : value === 1 ? "🟨" : "⬛"))
    .join("");
}

function patternCounts(pattern: number): { greens: number; yellows: number } {
  const digits = decodePattern(pattern);
  return {
    greens: digits.filter((digit) => digit === 2).length,
    yellows: digits.filter((digit) => digit === 1).length,
  };
}

export function scoreGuess(guess: string, answer: string): number {
  const normalizedGuess = guess.toLowerCase();
  const normalizedAnswer = answer.toLowerCase();
  const result = Array<number>(5).fill(0);
  const remaining = new Map<string, number>();

  for (const letter of normalizedAnswer) {
    remaining.set(letter, (remaining.get(letter) ?? 0) + 1);
  }

  for (let index = 0; index < 5; index += 1) {
    if (normalizedGuess[index] === normalizedAnswer[index]) {
      result[index] = 2;
      remaining.set(normalizedGuess[index], (remaining.get(normalizedGuess[index]) ?? 1) - 1);
    }
  }

  for (let index = 0; index < 5; index += 1) {
    if (result[index] === 2) continue;
    const count = remaining.get(normalizedGuess[index]) ?? 0;
    if (count > 0) {
      result[index] = 1;
      remaining.set(normalizedGuess[index], count - 1);
    }
  }

  return encodePattern(result);
}

export function filterCandidates(candidates: string[], guess: string, pattern: number): string[] {
  return candidates.filter((candidate) => scoreGuess(guess, candidate) === pattern);
}

const partitionCountsCache = new WeakMap<string[], Map<string, Map<number, number>>>();

function computePartitionCounts(guess: string, candidates: string[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const candidate of candidates) {
    const pattern = scoreGuess(guess, candidate);
    counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
  }
  return counts;
}

function partitionCounts(guess: string, candidates: string[]): Map<number, number> {
  let poolCache = partitionCountsCache.get(candidates);
  if (!poolCache) {
    poolCache = new Map();
    partitionCountsCache.set(candidates, poolCache);
  }

  const cached = poolCache.get(guess);
  if (cached) return cached;

  const counts = computePartitionCounts(guess, candidates);
  poolCache.set(guess, counts);
  return counts;
}

function shannonEntropy(counts: Map<number, number>): number {
  let total = 0;
  for (const value of counts.values()) total += value;
  if (!total) return 0;
  let entropy = 0;
  for (const value of counts.values()) {
    const p = value / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function expectedRemaining(counts: Map<number, number>): number {
  let total = 0;
  let numerator = 0;
  for (const value of counts.values()) {
    total += value;
    numerator += value * value;
  }
  return total ? numerator / total : 0;
}

function worstCaseBucket(counts: Map<number, number>): number {
  return Math.max(...counts.values(), 0);
}

function reductionRatio(total: number, worstCase: number): number {
  return total ? 1 - worstCase / total : 0;
}

/**
 * Size of the bucket the benchmark's evil adversary would return for this
 * (guess, candidate-set) pair. Mirrors the tie-break in chooseEvilPattern so
 * strategies can compute |T(C, g)| without materializing the candidate lists.
 */
function evilForcedBucketSize(guess: string, candidates: string[]): number {
  const buckets = partitionCounts(guess, candidates);
  if (buckets.size === 0) return 0;
  let bestPattern = -1;
  let bestSize = -1;
  let bestGreens = 0;
  let bestYellows = 0;
  let bestDigits: number[] = [];
  for (const [pattern, size] of buckets.entries()) {
    const { greens, yellows } = patternCounts(pattern);
    const digits = decodePattern(pattern);
    const better =
      size > bestSize
      || (size === bestSize && greens < bestGreens)
      || (size === bestSize && greens === bestGreens && yellows < bestYellows)
      || (size === bestSize && greens === bestGreens && yellows === bestYellows && compareDigits(digits, bestDigits) < 0);
    if (better) {
      bestPattern = pattern;
      bestSize = size;
      bestGreens = greens;
      bestYellows = yellows;
      bestDigits = digits;
    }
  }
  void bestPattern;
  return bestSize;
}

function compareDigits(left: number[], right: number[]): number {
  if (right.length === 0) return -1;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

function chooseEvilPattern(guess: string, candidates: string[]): { pattern: number; survivors: string[] } {
  const buckets = new Map<number, string[]>();
  for (const candidate of candidates) {
    const pattern = scoreGuess(guess, candidate);
    buckets.set(pattern, [...(buckets.get(pattern) ?? []), candidate]);
  }

  const ranked = [...buckets.entries()].sort((left, right) => {
    const [leftPattern, leftWords] = left;
    const [rightPattern, rightWords] = right;
    if (leftWords.length !== rightWords.length) return rightWords.length - leftWords.length;
    const leftCounts = patternCounts(leftPattern);
    const rightCounts = patternCounts(rightPattern);
    if (leftCounts.greens !== rightCounts.greens) return leftCounts.greens - rightCounts.greens;
    if (leftCounts.yellows !== rightCounts.yellows) return leftCounts.yellows - rightCounts.yellows;
    // Compare by digit values (ABSENT=0 < PRESENT=1 < CORRECT=2), not alphabetical
    const leftDigits = decodePattern(leftPattern);
    const rightDigits = decodePattern(rightPattern);
    for (let i = 0; i < 5; i++) {
      if (leftDigits[i] !== rightDigits[i]) return leftDigits[i] - rightDigits[i];
    }
    return 0;
  });

  const [pattern, survivors] = ranked[0];
  return { pattern, survivors: [...survivors].sort() };
}

function computePosterior(
  standardCandidates: string[],
  evilCandidates: string[],
  priorEvil: number,
  initialCount: number,
): Posterior {
  const standardLikelihood = standardCandidates.length / initialCount;
  const evilLikelihood = evilCandidates.length > 0 ? 1 : 0;
  const standardUnnormalized = (1 - priorEvil) * standardLikelihood;
  const evilUnnormalized = priorEvil * evilLikelihood;
  const total = standardUnnormalized + evilUnnormalized;
  if (!total) {
    return { standard: 0.5, evil: 0.5 };
  }
  return {
    standard: standardUnnormalized / total,
    evil: evilUnnormalized / total,
  };
}

function candidatePoolFor(state: GameState): string[] {
  return state.mode === "unknown"
    ? [...new Set([...state.standardCandidateWords, ...state.evilCandidateWords])].sort()
    : state.candidateWords;
}

function allAllowedGuessPool(state: GameState): string[] {
  return state.wordLists.allowed;
}

function inCandidateRank(guess: string, candidateSet: Set<string>): number {
  return candidateSet.has(guess) ? 0 : 1;
}

function compareRankKeys(left: Array<number | string>, right: Array<number | string> | null): number {
  if (right === null) return -1;
  for (let index = 0; index < left.length; index += 1) {
    const l = left[index];
    const r = right[index];
    if (l === r) continue;
    if (typeof l === "number" && typeof r === "number") return l - r;
    return String(l).localeCompare(String(r));
  }
  return left.length - right.length;
}

export function createGameState(
  mode: Mode,
  wordLists: WordLists,
  config?: {
    hiddenAnswer?: string;
    hiddenMode?: HiddenMode;
    priorEvil?: number;
    maxTurns?: number | null;
  },
): GameState {
  const priorEvil = config?.priorEvil ?? 0.5;
  const hiddenMode = mode === "unknown" ? config?.hiddenMode ?? (Math.random() < priorEvil ? "evil" : "standard") : mode;
  const answer = hiddenMode === "standard" ? config?.hiddenAnswer ?? wordLists.answers[Math.floor(Math.random() * wordLists.answers.length)] : null;
  return {
    mode,
    hiddenMode,
    hiddenAnswer: answer,
    priorEvil,
    guesses: [],
    feedbacks: [],
    steps: [],
    candidateWords: [...wordLists.answers],
    standardCandidateWords: [...wordLists.answers],
    evilCandidateWords: [...wordLists.answers],
    modePosterior: { standard: 0.5, evil: 0.5 },
    solved: false,
    exhausted: false,
    maxTurns: config?.maxTurns ?? 6,
    wordLists,
  };
}

export function applyGuessToState(
  state: GameState,
  guess: string,
  explanation?: DecisionExplanation,
): GameState {
  const normalized = guess.toLowerCase();
  if (!state.wordLists.allowed.includes(normalized) && !state.wordLists.answers.includes(normalized)) {
    throw new Error("Invalid guess.");
  }
  if (state.solved || state.exhausted) {
    throw new Error("Game already finished.");
  }

  let pattern = 0;
  let candidateWords = state.candidateWords;
  let standardCandidateWords = state.standardCandidateWords;
  let evilCandidateWords = state.evilCandidateWords;
  const priorStandardCandidateWords = state.standardCandidateWords;
  const priorEvilCandidateWords = state.evilCandidateWords;

  if (state.hiddenMode === "standard") {
    pattern = scoreGuess(normalized, state.hiddenAnswer ?? state.wordLists.answers[0]);
  } else {
    const evilResult = chooseEvilPattern(normalized, priorEvilCandidateWords);
    pattern = evilResult.pattern;
  }

  if (state.mode === "unknown") {
    standardCandidateWords = filterCandidates(priorStandardCandidateWords, normalized, pattern);
    if (priorEvilCandidateWords.length > 0) {
      const evilResult = chooseEvilPattern(normalized, priorEvilCandidateWords);
      evilCandidateWords =
        evilResult.pattern === pattern ? evilResult.survivors : [];
    }
    const unionCandidates = [...new Set([...standardCandidateWords, ...evilCandidateWords])].sort();
    // Fallback to standard candidates if union is empty (matches Python engine behavior)
    candidateWords = unionCandidates.length > 0 ? unionCandidates : [...standardCandidateWords].sort();
  } else if (state.hiddenMode === "standard") {
    standardCandidateWords = filterCandidates(priorStandardCandidateWords, normalized, pattern);
    candidateWords = standardCandidateWords;
  } else {
    evilCandidateWords = chooseEvilPattern(normalized, priorEvilCandidateWords).survivors;
    candidateWords = evilCandidateWords;
  }

  const modePosterior =
    state.mode === "unknown"
      ? computePosterior(
        standardCandidateWords,
        evilCandidateWords.length ? evilCandidateWords : [],
        state.priorEvil,
        state.wordLists.answers.length,
      )
      : state.hiddenMode === "evil"
        ? { standard: 0, evil: 1 }
        : { standard: 1, evil: 0 };

  const solved =
    state.hiddenMode === "standard"
      ? pattern === ALL_CORRECT_PATTERN
      : pattern === ALL_CORRECT_PATTERN && candidateWords.length === 1;

  const turn = state.guesses.length + 1;
  const exhausted = !solved && state.maxTurns !== null ? turn >= state.maxTurns : false;
  const step: GameStep = {
    turn,
    guess: normalized,
    pattern,
    patternText: patternToText(pattern),
    patternEmoji: patternToEmoji(pattern),
    remainingCandidates: candidateWords.length,
    candidatePreview: candidateWords.slice(0, 8),
    explanation,
    modePosterior,
    standardCandidates: standardCandidateWords.length,
    evilCandidates: evilCandidateWords.length,
  };

  return {
    ...state,
    guesses: [...state.guesses, normalized],
    feedbacks: [...state.feedbacks, pattern],
    steps: [...state.steps, step],
    candidateWords,
    standardCandidateWords,
    evilCandidateWords,
    modePosterior,
    solved,
    exhausted,
  };
}

function deterministicChoice(seedText: string, pool: string[]): string {
  let hash = 0;
  for (const character of seedText) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return pool[hash % pool.length];
}

function stateSeed(state: GameState): string {
  return `${state.mode}|${state.guesses.join(",")}|${state.feedbacks.join(",")}|${state.candidateWords.join(",")}`;
}

function letterFrequencyDecision(pool: string[]): { guess: string; explanation: DecisionExplanation } {
  const positional = Array.from({ length: 5 }, () => new Map<string, number>());
  const global = new Map<string, number>();

  for (const word of pool) {
    const unique = new Set(word);
    unique.forEach((letter) => global.set(letter, (global.get(letter) ?? 0) + 1));
    [...word].forEach((letter, index) => positional[index].set(letter, (positional[index].get(letter) ?? 0) + 1));
  }

  let bestGuess = pool[0];
  let bestScore = -Infinity;
  for (const guess of pool) {
    const seen = new Set<string>();
    let globalScore = 0;
    guess.split("").forEach((letter) => {
      if (!seen.has(letter)) {
        globalScore += global.get(letter) ?? 0;
        seen.add(letter);
      }
    });
    const positionalScore = guess.split("").reduce((total, letter, index) => total + (positional[index].get(letter) ?? 0), 0);
    const score = positionalScore + globalScore * 0.4;
    if (score > bestScore || (score === bestScore && guess < bestGuess)) {
      bestScore = score;
      bestGuess = guess;
    }
  }

  return {
    guess: bestGuess,
    explanation: {
      score: Number(bestScore.toFixed(4)),
      poolSize: pool.length,
    },
  };
}

function evaluatePool(
  guess: string,
  candidates: string[],
): {
  entropy: number;
  expectedRemaining: number;
  worstCase: number;
  reduction: number;
} {
  const counts = partitionCounts(guess, candidates);
  const entropy = shannonEntropy(counts);
  const worstCase = worstCaseBucket(counts);
  return {
    entropy,
    expectedRemaining: expectedRemaining(counts),
    worstCase,
    reduction: reductionRatio(candidates.length, worstCase),
  };
}

function partitionDecision(
  state: GameState,
  metric: "entropy" | "elimination" | "minimax",
): { guess: string; explanation: DecisionExplanation } {
  const candidates = candidatePoolFor(state);
  const guesses = allAllowedGuessPool(state);
  const candidateSet = new Set(candidates);
  let bestGuess = candidates[0];
  let bestKey: Array<number | string> | null = null;
  let bestStats = evaluatePool(bestGuess, candidates);

  for (const guess of guesses) {
    const stats = evaluatePool(guess, candidates);
    const value =
      metric === "entropy" ? stats.entropy : metric === "elimination" ? -stats.expectedRemaining : -stats.worstCase;
    const key = [-value, stats.worstCase, inCandidateRank(guess, candidateSet), guess];
    if (compareRankKeys(key, bestKey) < 0) {
      bestGuess = guess;
      bestKey = key;
      bestStats = stats;
    }
  }

  return {
    guess: bestGuess,
    explanation: {
      poolSize: candidates.length,
      guessPoolSize: guesses.length,
      entropy: Number(bestStats.entropy.toFixed(6)),
      expectedRemaining: Number(bestStats.expectedRemaining.toFixed(6)),
      worstCase: bestStats.worstCase,
      reductionRatio: Number(bestStats.reduction.toFixed(6)),
    },
  };
}

function posteriorHybridDecision(state: GameState): { guess: string; explanation: DecisionExplanation } {
  const pool = candidatePoolFor(state);
  const guesses = allAllowedGuessPool(state);
  const candidateSet = new Set(pool);

  let standardWeight: number;
  let evilWeight: number;
  if (state.mode === "standard") {
    standardWeight = 1.0;
    evilWeight = 0.0;
  } else if (state.mode === "evil") {
    standardWeight = 0.0;
    evilWeight = 1.0;
  } else {
    standardWeight = state.modePosterior.standard;
    evilWeight = state.modePosterior.evil;
  }

  const standardPool = state.standardCandidateWords.length ? state.standardCandidateWords : pool;
  const evilPool = state.evilCandidateWords.length ? state.evilCandidateWords : pool;

  // Guard singleton / empty pools: log2(<=1) is 0 or undefined, which would
  // make normalizedEntropy a division-by-zero. Falling back to 1.0 makes the
  // normalized score 0 -- the correct limit when no information can be gained.
  const maxEntropy = standardPool.length > 1 ? Math.log2(standardPool.length) : 1.0;

  let bestGuess = pool[0];
  let bestKey: Array<number | string> | null = null;
  let bestDetails: DecisionExplanation = {};

  for (const guess of guesses) {
    const standardStats = evaluatePool(guess, standardPool);
    const evilStats = evaluatePool(guess, evilPool);
    const normalizedStandardEntropy = standardStats.entropy / maxEntropy;
    const blended =
      standardWeight * normalizedStandardEntropy +
      evilWeight * evilStats.reduction;
    const key = [-blended, evilStats.worstCase, inCandidateRank(guess, candidateSet), guess];
    if (compareRankKeys(key, bestKey) < 0) {
      bestGuess = guess;
      bestKey = key;
      bestDetails = {
        poolSize: pool.length,
        guessPoolSize: guesses.length,
        standardEntropy: Number(standardStats.entropy.toFixed(6)),
        normalizedStandardEntropy: Number(normalizedStandardEntropy.toFixed(6)),
        evilReductionRatio: Number(evilStats.reduction.toFixed(6)),
        evilWorstCase: evilStats.worstCase,
        blendedScore: Number(blended.toFixed(6)),
        modeWeights: { standard: standardWeight, evil: evilWeight },
      };
    }
  }

  return { guess: bestGuess, explanation: bestDetails };
}

function evilShortestPathDecision(state: GameState): { guess: string; explanation: DecisionExplanation } {
  const pool = candidatePoolFor(state);
  const guesses = allAllowedGuessPool(state);
  const candidateSet = new Set(pool);
  let bestGuess = pool[0];
  let bestKey: Array<number | string> | null = null;
  let bestDetails: DecisionExplanation = {};
  for (const guess of guesses) {
    const counts = partitionCounts(guess, pool);
    const forced = evilForcedBucketSize(guess, pool);
    const entropy = shannonEntropy(counts);
    const key = [forced, -entropy, inCandidateRank(guess, candidateSet), guess];
    if (compareRankKeys(key, bestKey) < 0) {
      bestGuess = guess;
      bestKey = key;
      bestDetails = {
        poolSize: pool.length,
        guessPoolSize: guesses.length,
        evilForcedBucket: forced,
        entropy: Number(entropy.toFixed(6)),
      };
    }
  }
  return { guess: bestGuess, explanation: bestDetails };
}

function modeWeights(state: GameState, standardPoolSize: number): { q: number; evil: number } {
  if (state.mode === "standard") return { q: 1.0, evil: 0.0 };
  if (state.mode === "evil") return { q: 0.0, evil: 1.0 };
  // Unknown: use the precomputed posterior when available, otherwise fall back
  // to the spec's closed-form q = |C_std| / (N + |C_std|).
  const posterior = state.modePosterior;
  if (posterior && posterior.standard + posterior.evil > 0) {
    return { q: posterior.standard, evil: posterior.evil };
  }
  const totalAnswers = state.wordLists.answers.length;
  const denom = totalAnswers + standardPoolSize;
  const q = denom > 0 ? standardPoolSize / denom : 0.5;
  return { q, evil: 1 - q };
}

function posteriorExpectimaxDecision(state: GameState): { guess: string; explanation: DecisionExplanation } {
  const pool = candidatePoolFor(state);
  const guesses = allAllowedGuessPool(state);
  const candidateSet = new Set(pool);
  const standardPool = state.standardCandidateWords.length ? state.standardCandidateWords : pool;
  const { q, evil } = modeWeights(state, standardPool.length);
  let bestGuess = pool[0];
  let bestKey: Array<number | string> | null = null;
  let bestDetails: DecisionExplanation = {};
  for (const guess of guesses) {
    const counts = partitionCounts(guess, pool);
    const expected = expectedRemaining(counts);
    const forced = evilForcedBucketSize(guess, pool);
    const score = q * expected + evil * forced;
    const key = [score, inCandidateRank(guess, candidateSet), forced, guess];
    if (compareRankKeys(key, bestKey) < 0) {
      bestGuess = guess;
      bestKey = key;
      bestDetails = {
        poolSize: pool.length,
        guessPoolSize: guesses.length,
        expectedRemaining: Number(expected.toFixed(6)),
        evilForcedBucket: forced,
        blendedScore: Number(score.toFixed(6)),
        modeWeights: { standard: Number(q.toFixed(6)), evil: Number(evil.toFixed(6)) },
      };
    }
  }
  return { guess: bestGuess, explanation: bestDetails };
}

function robustScalarizationDecision(state: GameState): { guess: string; explanation: DecisionExplanation } {
  const pool = candidatePoolFor(state);
  const guesses = allAllowedGuessPool(state);
  const candidateSet = new Set(pool);
  let bestGuess = pool[0];
  let bestKey: Array<number | string> | null = null;
  let bestDetails: DecisionExplanation = {};
  for (const guess of guesses) {
    const counts = partitionCounts(guess, pool);
    const expected = expectedRemaining(counts);
    const forced = evilForcedBucketSize(guess, pool);
    const robust = Math.max(expected, forced);
    const mean = 0.5 * (expected + forced);
    const key = [robust, mean, inCandidateRank(guess, candidateSet), guess];
    if (compareRankKeys(key, bestKey) < 0) {
      bestGuess = guess;
      bestKey = key;
      bestDetails = {
        poolSize: pool.length,
        guessPoolSize: guesses.length,
        standardCost: Number(expected.toFixed(6)),
        evilCost: forced,
        robustScore: Number(robust.toFixed(6)),
        meanCost: Number(mean.toFixed(6)),
      };
    }
  }
  return { guess: bestGuess, explanation: bestDetails };
}

export function chooseStrategyGuess(
  state: GameState,
  strategyId: string,
): { guess: string; explanation: DecisionExplanation } {
  const pool = candidatePoolFor(state);
  if (!pool.length) {
    throw new Error("No feasible candidates remain.");
  }
  switch (strategyId) {
    case "random-valid":
      return {
        guess: deterministicChoice(stateSeed(state), pool),
        explanation: { poolSize: pool.length },
      };
    case "letter-frequency":
      return letterFrequencyDecision(pool);
    case "candidate-elimination":
      return partitionDecision(state, "elimination");
    case "expected-entropy":
      return partitionDecision(state, "entropy");
    case "minimax":
      return partitionDecision(state, "minimax");
    case "posterior-hybrid":
      return posteriorHybridDecision(state);
    case "evil-shortest-path":
      return evilShortestPathDecision(state);
    case "posterior-expectimax":
      return posteriorExpectimaxDecision(state);
    case "robust-scalarization":
      return robustScalarizationDecision(state);
    case "evil-dp":
      // Browser fallback: exact DP lives in the Python engine with a 524KB
      // precomputed policy. In the interactive lab, fall back to the greedy
      // evil-shortest-path objective, which is its base heuristic anyway.
    {
      const fallbackDecision = evilShortestPathDecision(state);
      return {
        ...fallbackDecision,
        explanation: {
          ...fallbackDecision.explanation,
          browserFallback: "evil-shortest-path-greedy",
          dpOptimal: false,
        },
      };
    }
    default:
      throw new Error(`Unknown strategy: ${strategyId}`);
  }
}

export type GuessRanking = {
  guess: string;
  entropy: number;
  expectedRemaining: number;
  worstCase: number;
};

export type InsightBar = {
  guess: string;
  value: number;
  display: string;
};

export type InsightSplit = {
  guess: string;
  standardPart: number;
  evilPart: number;
  total: number;
};

export type InsightHeatmapCell = {
  letter: string;
  weight: number;
};

export type StrategyInsight =
  | {
      kind: "bars";
      metricLabel: string;
      unitLabel: string;
      higherIsBetter: boolean;
      poolSize: number;
      entries: InsightBar[];
    }
  | {
      kind: "split";
      metricLabel: string;
      standardLabel: string;
      evilLabel: string;
      standardWeight: number;
      evilWeight: number;
      poolSize: number;
      entries: InsightSplit[];
    }
  | {
      kind: "heatmap";
      metricLabel: string;
      poolSize: number;
      columns: InsightHeatmapCell[][];
    }
  | {
      kind: "pills";
      metricLabel: string;
      poolSize: number;
      entries: string[];
    };

function poolFor(state: GameState): string[] {
  return candidatePoolFor(state);
}

export function rankTopGuesses(state: GameState, limit = 6): GuessRanking[] {
  const candidates = poolFor(state);
  const guesses = allAllowedGuessPool(state);
  const candidateSet = new Set(candidates);
  if (!candidates.length) return [];
  if (candidates.length === 1) {
    return [{ guess: candidates[0], entropy: 0, expectedRemaining: 1, worstCase: 1 }];
  }
  const ranked: GuessRanking[] = guesses.map((guess) => {
    const counts = partitionCounts(guess, candidates);
    return {
      guess,
      entropy: shannonEntropy(counts),
      expectedRemaining: expectedRemaining(counts),
      worstCase: worstCaseBucket(counts),
    };
  });
  ranked.sort((a, b) => {
    if (b.entropy !== a.entropy) return b.entropy - a.entropy;
    if (a.worstCase !== b.worstCase) return a.worstCase - b.worstCase;
    const candidateCmp = inCandidateRank(a.guess, candidateSet) - inCandidateRank(b.guess, candidateSet);
    if (candidateCmp !== 0) return candidateCmp;
    return a.guess.localeCompare(b.guess);
  });
  return ranked.slice(0, limit);
}

type BarMetric = "entropy" | "expectedRemaining" | "worstCase" | "evilBucket";

function rankBars(state: GameState, metric: BarMetric, limit: number): InsightBar[] {
  const pool = poolFor(state);
  const guesses = allAllowedGuessPool(state);
  const candidateSet = new Set(pool);
  if (!pool.length) return [];
  const scored = guesses.map((guess) => {
    const counts = partitionCounts(guess, pool);
    let value: number;
    let display: string;
    let key: Array<number | string>;
    switch (metric) {
      case "entropy":
        value = shannonEntropy(counts);
        display = value.toFixed(2);
        key = [-value, worstCaseBucket(counts), inCandidateRank(guess, candidateSet), guess];
        break;
      case "expectedRemaining":
        value = expectedRemaining(counts);
        display = value < 10 ? value.toFixed(2) : value.toFixed(0);
        key = [value, worstCaseBucket(counts), inCandidateRank(guess, candidateSet), guess];
        break;
      case "worstCase":
        value = worstCaseBucket(counts);
        display = String(value);
        key = [value, inCandidateRank(guess, candidateSet), guess];
        break;
      case "evilBucket":
        value = evilForcedBucketSize(guess, pool);
        display = String(value);
        key = [value, -shannonEntropy(counts), inCandidateRank(guess, candidateSet), guess];
        break;
    }
    return { guess, value, display, key };
  });
  scored.sort((a, b) => compareRankKeys(a.key, b.key));
  return scored.slice(0, limit);
}

function rankPosteriorHybrid(state: GameState, limit: number): {
  entries: InsightSplit[];
  standardWeight: number;
  evilWeight: number;
  poolSize: number;
} {
  const pool = poolFor(state);
  const guesses = allAllowedGuessPool(state);
  const candidateSet = new Set(pool);
  const standardPool = state.standardCandidateWords.length ? state.standardCandidateWords : pool;
  const evilPool = state.evilCandidateWords.length ? state.evilCandidateWords : pool;
  let standardWeight: number;
  let evilWeight: number;
  if (state.mode === "standard") {
    standardWeight = 1.0;
    evilWeight = 0.0;
  } else if (state.mode === "evil") {
    standardWeight = 0.0;
    evilWeight = 1.0;
  } else {
    standardWeight = state.modePosterior.standard;
    evilWeight = state.modePosterior.evil;
  }
  const maxEntropy = standardPool.length > 1 ? Math.log2(standardPool.length) : 1.0;
  const scored = guesses.map((guess) => {
    const standardStats = evaluatePool(guess, standardPool);
    const evilStats = evaluatePool(guess, evilPool);
    const standardPart = standardWeight * (standardStats.entropy / maxEntropy);
    const evilPart = evilWeight * evilStats.reduction;
    const total = standardPart + evilPart;
    return {
      guess,
      standardPart,
      evilPart,
      total,
      key: [-total, evilStats.worstCase, inCandidateRank(guess, candidateSet), guess],
    };
  });
  scored.sort((a, b) => compareRankKeys(a.key, b.key));
  return { entries: scored.slice(0, limit), standardWeight, evilWeight, poolSize: pool.length };
}

function rankBlendedCost(
  state: GameState,
  shape: "expectimax" | "robust",
  limit: number,
): {
  entries: InsightSplit[];
  standardWeight: number;
  evilWeight: number;
  poolSize: number;
} {
  const pool = poolFor(state);
  const guesses = allAllowedGuessPool(state);
  const candidateSet = new Set(pool);
  const standardPool = state.standardCandidateWords.length ? state.standardCandidateWords : pool;
  const { q, evil } = modeWeights(state, standardPool.length);
  const standardWeight = shape === "robust" ? 0.5 : q;
  const evilWeight = shape === "robust" ? 0.5 : evil;
  const scored = guesses.map((guess) => {
    const counts = partitionCounts(guess, pool);
    const expected = expectedRemaining(counts);
    const forced = evilForcedBucketSize(guess, pool);
    const maxCost = Math.max(pool.length, 1);
    const standardNorm = expected / maxCost;
    const evilNorm = forced / maxCost;
    const standardPart = standardWeight * (1 - standardNorm);
    const evilPart = evilWeight * (1 - evilNorm);
    const total = standardPart + evilPart;
    const cost = shape === "robust" ? Math.max(expected, forced) : q * expected + evil * forced;
    const secondary = shape === "robust" ? 0.5 * (expected + forced) : inCandidateRank(guess, candidateSet);
    return {
      guess,
      standardPart,
      evilPart,
      total,
      key: shape === "robust"
        ? [cost, secondary, inCandidateRank(guess, candidateSet), guess]
        : [cost, inCandidateRank(guess, candidateSet), forced, guess],
    };
  });
  scored.sort((a, b) => compareRankKeys(a.key, b.key));
  return { entries: scored.slice(0, limit), standardWeight, evilWeight, poolSize: pool.length };
}

function letterHeatmap(state: GameState): { columns: InsightHeatmapCell[][]; poolSize: number } {
  const pool = poolFor(state);
  if (!pool.length) return { columns: [[], [], [], [], []], poolSize: 0 };
  const columns: InsightHeatmapCell[][] = Array.from({ length: 5 }, () => []);
  for (let position = 0; position < 5; position += 1) {
    const counts = new Map<string, number>();
    for (const word of pool) {
      const letter = word[position];
      counts.set(letter, (counts.get(letter) ?? 0) + 1);
    }
    const entries = [...counts.entries()]
      .map(([letter, count]) => ({ letter, weight: count / pool.length }))
      .sort((a, b) => b.weight - a.weight || a.letter.localeCompare(b.letter))
      .slice(0, 4);
    columns[position] = entries;
  }
  return { columns, poolSize: pool.length };
}

function samplePills(state: GameState, limit: number): { entries: string[]; poolSize: number } {
  const pool = poolFor(state);
  if (!pool.length) return { entries: [], poolSize: 0 };
  const seed = pool.length + (state.steps.length ?? 0);
  const rng = (index: number) => {
    const x = Math.sin(seed * 9301 + index * 49297) * 233280;
    return x - Math.floor(x);
  };
  const indices = new Set<number>();
  const entries: string[] = [];
  let attempt = 0;
  while (entries.length < Math.min(limit, pool.length) && attempt < limit * 6) {
    const index = Math.floor(rng(attempt) * pool.length);
    if (!indices.has(index)) {
      indices.add(index);
      entries.push(pool[index]);
    }
    attempt += 1;
  }
  return { entries, poolSize: pool.length };
}

export function computeStrategyInsight(
  state: GameState,
  strategyId: string,
  limit = 6,
): StrategyInsight | null {
  const pool = poolFor(state);
  if (!pool.length) return null;
  switch (strategyId) {
    case "expected-entropy":
      return {
        kind: "bars",
        metricLabel: "expected entropy",
        unitLabel: "bits",
        higherIsBetter: true,
        poolSize: pool.length,
        entries: rankBars(state, "entropy", limit),
      };
    case "candidate-elimination":
      return {
        kind: "bars",
        metricLabel: "expected remaining",
        unitLabel: "words",
        higherIsBetter: false,
        poolSize: pool.length,
        entries: rankBars(state, "expectedRemaining", limit),
      };
    case "minimax":
      return {
        kind: "bars",
        metricLabel: "worst-case bucket",
        unitLabel: "words",
        higherIsBetter: false,
        poolSize: pool.length,
        entries: rankBars(state, "worstCase", limit),
      };
    case "evil-shortest-path":
      return {
        kind: "bars",
        metricLabel: "adversary's bucket",
        unitLabel: "words",
        higherIsBetter: false,
        poolSize: pool.length,
        entries: rankBars(state, "evilBucket", limit),
      };
    case "evil-dp":
      return {
        kind: "bars",
        metricLabel: "adversary's bucket (greedy proxy)",
        unitLabel: "words",
        higherIsBetter: false,
        poolSize: pool.length,
        entries: rankBars(state, "evilBucket", limit),
      };
    case "letter-frequency": {
      const { columns, poolSize } = letterHeatmap(state);
      return {
        kind: "heatmap",
        metricLabel: "letter frequency · by position",
        poolSize,
        columns,
      };
    }
    case "posterior-hybrid": {
      const { entries, standardWeight, evilWeight, poolSize } = rankPosteriorHybrid(state, limit);
      return {
        kind: "split",
        metricLabel: "blended score",
        standardLabel: "entropy",
        evilLabel: "evil reduction",
        standardWeight,
        evilWeight,
        poolSize,
        entries,
      };
    }
    case "posterior-expectimax": {
      const { entries, standardWeight, evilWeight, poolSize } = rankBlendedCost(state, "expectimax", limit);
      return {
        kind: "split",
        metricLabel: "posterior cost (inverse)",
        standardLabel: "standard",
        evilLabel: "evil",
        standardWeight,
        evilWeight,
        poolSize,
        entries,
      };
    }
    case "robust-scalarization": {
      const { entries, standardWeight, evilWeight, poolSize } = rankBlendedCost(state, "robust", limit);
      return {
        kind: "split",
        metricLabel: "robust score",
        standardLabel: "standard",
        evilLabel: "evil",
        standardWeight,
        evilWeight,
        poolSize,
        entries,
      };
    }
    case "random-valid": {
      const { entries, poolSize } = samplePills(state, limit);
      return {
        kind: "pills",
        metricLabel: "uniform sample",
        poolSize,
        entries,
      };
    }
    default:
      return null;
  }
}

export async function loadWordLists(): Promise<WordLists> {
  const [answersText, allowedText] = await Promise.all([
    fetch("/generated/wordlists/answers.txt").then((response) => response.text()),
    fetch("/generated/wordlists/allowed.txt").then((response) => response.text()),
  ]);

  const answers = answersText.split(/\s+/).filter(Boolean);
  const allowed = Array.from(new Set([...allowedText.split(/\s+/).filter(Boolean), ...answers]));
  return { answers, allowed };
}

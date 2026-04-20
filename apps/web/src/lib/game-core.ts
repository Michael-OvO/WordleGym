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

function partitionCounts(guess: string, candidates: string[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const candidate of candidates) {
    const pattern = scoreGuess(guess, candidate);
    counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
  }
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

  if (state.hiddenMode === "standard") {
    pattern = scoreGuess(normalized, state.hiddenAnswer ?? state.wordLists.answers[0]);
    standardCandidateWords = filterCandidates(standardCandidateWords, normalized, pattern);
  } else {
    const evilResult = chooseEvilPattern(normalized, evilCandidateWords);
    pattern = evilResult.pattern;
    evilCandidateWords = evilResult.survivors;
  }

  if (state.mode === "unknown") {
    standardCandidateWords = filterCandidates(standardCandidateWords, normalized, pattern);
    if (evilCandidateWords.length > 0) {
      const evilResult = chooseEvilPattern(normalized, evilCandidateWords);
      evilCandidateWords =
        evilResult.pattern === pattern ? filterCandidates(evilCandidateWords, normalized, pattern) : [];
    }
    const unionCandidates = [...new Set([...standardCandidateWords, ...evilCandidateWords])].sort();
    // Fallback to standard candidates if union is empty (matches Python engine behavior)
    candidateWords = unionCandidates.length > 0 ? unionCandidates : [...standardCandidateWords].sort();
  } else if (state.hiddenMode === "standard") {
    candidateWords = standardCandidateWords;
  } else {
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
  const pool = state.mode === "unknown" ? [...new Set([...state.standardCandidateWords, ...state.evilCandidateWords])].sort() : state.candidateWords;
  let bestGuess = pool[0];
  let bestValue = metric === "minimax" ? Infinity : -Infinity;
  let bestStats = evaluatePool(bestGuess, pool);

  for (const guess of pool) {
    const stats = evaluatePool(guess, pool);
    const value =
      metric === "entropy" ? stats.entropy : metric === "elimination" ? -stats.expectedRemaining : stats.worstCase;
    let isBetter: boolean;
    if (metric === "minimax") {
      isBetter = value < bestValue
        || (value === bestValue && stats.worstCase < bestStats.worstCase)
        || (value === bestValue && stats.worstCase === bestStats.worstCase && guess < bestGuess);
    } else {
      // For entropy/elimination: primary value, then secondary worst-case (ascending), then alphabetical
      isBetter = value > bestValue
        || (value === bestValue && stats.worstCase < bestStats.worstCase)
        || (value === bestValue && stats.worstCase === bestStats.worstCase && guess < bestGuess);
    }
    if (isBetter) {
      bestGuess = guess;
      bestValue = value;
      bestStats = stats;
    }
  }

  return {
    guess: bestGuess,
    explanation: {
      poolSize: pool.length,
      entropy: Number(bestStats.entropy.toFixed(6)),
      expectedRemaining: Number(bestStats.expectedRemaining.toFixed(6)),
      worstCase: bestStats.worstCase,
      reductionRatio: Number(bestStats.reduction.toFixed(6)),
    },
  };
}

function adaptiveDecision(state: GameState): { guess: string; explanation: DecisionExplanation } {
  const pool = state.mode === "unknown" ? [...new Set([...state.standardCandidateWords, ...state.evilCandidateWords])].sort() : state.candidateWords;

  // Match Python's weight logic: use posterior for unknown mode,
  // explicit weights for standard/evil modes
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

  let bestGuess = pool[0];
  let bestBlended = -Infinity;
  let bestDetails: DecisionExplanation = {};

  for (const guess of pool) {
    const standardPool = state.standardCandidateWords.length ? state.standardCandidateWords : pool;
    const evilPool = state.evilCandidateWords.length ? state.evilCandidateWords : pool;
    const standardStats = evaluatePool(guess, standardPool);
    const evilStats = evaluatePool(guess, evilPool);
    const blended =
      standardWeight * standardStats.entropy +
      evilWeight * evilStats.reduction;
    const bestEvilWorst = typeof bestDetails.evilWorstCase === "number" ? bestDetails.evilWorstCase : Infinity;
    if (blended > bestBlended
      || (blended === bestBlended && evilStats.worstCase < bestEvilWorst)
      || (blended === bestBlended && evilStats.worstCase === bestEvilWorst && guess < bestGuess)) {
      bestGuess = guess;
      bestBlended = blended;
      bestDetails = {
        poolSize: pool.length,
        standardEntropy: Number(standardStats.entropy.toFixed(6)),
        evilReductionRatio: Number(evilStats.reduction.toFixed(6)),
        evilWorstCase: evilStats.worstCase,
        blendedScore: Number(blended.toFixed(6)),
        modeWeights: { standard: standardWeight, evil: evilWeight },
      };
    }
  }

  return { guess: bestGuess, explanation: bestDetails };
}

export function chooseStrategyGuess(
  state: GameState,
  strategyId: string,
): { guess: string; explanation: DecisionExplanation } {
  const pool = state.mode === "unknown" ? [...new Set([...state.standardCandidateWords, ...state.evilCandidateWords])].sort() : state.candidateWords;
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
    case "adaptive-robust":
      return adaptiveDecision(state);
    default:
      throw new Error(`Unknown strategy: ${strategyId}`);
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

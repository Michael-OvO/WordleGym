import fixtures from "../../public/generated/parity-fixtures.json";
import { readFileSync } from "node:fs";
import path from "node:path";

import { chooseStrategyGuess, createGameState, filterCandidates, patternToText, scoreGuess, type WordLists } from "@/lib/game-core";

function loadGeneratedWordLists(): WordLists {
  const generatedDir = path.join(process.cwd(), "public", "generated", "wordlists");
  const answers = readFileSync(path.join(generatedDir, "answers.txt"), "utf-8").split(/\s+/).filter(Boolean);
  const allowed = Array.from(new Set([
    ...readFileSync(path.join(generatedDir, "allowed.txt"), "utf-8").split(/\s+/).filter(Boolean),
    ...answers,
  ]));
  return { answers, allowed };
}

describe("game-core parity", () => {
  test("matches fixture scoring cases", () => {
    fixtures.score_cases.forEach((item) => {
      const pattern = scoreGuess(item.guess, item.answer);
      expect(pattern).toBe(item.pattern);
      expect(patternToText(pattern)).toBe(item.pattern_text);
    });
  });

  test("filters candidates consistently", () => {
    const filtered = filterCandidates(
      fixtures.toy_answers as string[],
      fixtures.standard_filter_case.guess,
      fixtures.standard_filter_case.pattern,
    );
    expect(filtered).toEqual(fixtures.standard_filter_case.remaining);
  });

  test("strategy openers match the Python benchmark full-vocabulary policies", () => {
    const wordLists = loadGeneratedWordLists();
    const state = createGameState("standard", wordLists, { hiddenAnswer: "cigar" });
    expect(chooseStrategyGuess(state, "expected-entropy").guess).toBe("soare");
    expect(chooseStrategyGuess(state, "candidate-elimination").guess).toBe("roate");
    expect(chooseStrategyGuess(state, "minimax").guess).toBe("arise");
    expect(chooseStrategyGuess(state, "evil-shortest-path").guess).toBe("raise");
    expect(chooseStrategyGuess(state, "posterior-expectimax").guess).toBe("roate");
    expect(chooseStrategyGuess(state, "posterior-hybrid").guess).toBe("soare");
    expect(chooseStrategyGuess(state, "robust-scalarization").guess).toBe("raise");
  }, 120000);
});

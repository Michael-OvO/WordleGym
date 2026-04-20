import fixtures from "../../public/generated/parity-fixtures.json";
import { filterCandidates, patternToText, scoreGuess } from "@/lib/game-core";

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
});

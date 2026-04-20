import React from "react";
import { render, screen } from "@testing-library/react";

import { ResultsExplorer } from "@/components/results-explorer";

describe("ResultsExplorer", () => {
  test("renders supplied benchmark rows", () => {
    render(
      <ResultsExplorer
        decisions={[]}
        replays={{ standard: {}, evil: {}, unknown: {} }}
        robustness={{ matrix: {}, mismatch_spread: [] }}
        summaries={{
          standard: [
            {
              strategy_id: "expected-entropy",
              label: "Expected Entropy",
              objective: "Maximize expected information gain.",
              games: 10,
              average_guesses: 3.2,
              average_guesses_on_solve: 3.2,
              solve_rate: 1,
              worst_case: 5,
              penalized_average_guesses: 3.2,
            },
          ],
          evil: [],
          unknown: [],
        }}
      />,
    );

    expect(screen.getByText("Expected Entropy")).toBeInTheDocument();
    expect(screen.getAllByText("3.200")).toHaveLength(2);
  });
});

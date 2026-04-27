import React from "react";
import { render, screen } from "@testing-library/react";

import { PlayLab } from "@/components/play-lab";

describe("PlayLab", () => {
  test("renders lab chrome", () => {
    render(<PlayLab mode="standard" />);
    expect(screen.getByText(/standard mode/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Solver step" })).toBeInTheDocument();
  });
});

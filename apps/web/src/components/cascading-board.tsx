"use client";

import { useEffect, useReducer, useState } from "react";

/**
 * Multiple solve sequences from different strategies — all solving "CIGAR"
 * Cycles through them to show how different algorithms approach the same puzzle.
 */
const SOLVE_SEQUENCES: { label: string; rows: { letters: string; pattern: string }[] }[] = [
  {
    label: "Expected Entropy",
    rows: [
      { letters: "RAISE", pattern: "YYYBB" },
      { letters: "TRAIL", pattern: "BYYYB" },
      { letters: "CIGAR", pattern: "GGGGG" },
    ],
  },
  {
    label: "Letter Frequency",
    rows: [
      { letters: "SLATE", pattern: "BBYBB" },
      { letters: "MANOR", pattern: "BYBBG" },
      { letters: "CIGAR", pattern: "GGGGG" },
    ],
  },
  {
    label: "Minimax",
    rows: [
      { letters: "ARISE", pattern: "YYYBB" },
      { letters: "NADIR", pattern: "BYBYG" },
      { letters: "CIGAR", pattern: "GGGGG" },
    ],
  },
  {
    label: "Random Valid",
    rows: [
      { letters: "FIERY", pattern: "BGBYB" },
      { letters: "RIVAL", pattern: "YGBGB" },
      { letters: "CIGAR", pattern: "GGGGG" },
    ],
  },
];

const TOTAL_ROWS = 6;
const ROW_DELAY = 480;
const COL_DELAY = 65;
const CYCLE_MS = 4600;

function tileClass(code: string): string {
  if (code === "G") return "grid-cell tile-G";
  if (code === "Y") return "grid-cell tile-Y";
  if (code === "B") return "grid-cell tile-B";
  return "grid-cell tile-empty";
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

export function CascadingBoard() {
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  const reducedMotion = useReducedMotion();
  const sequenceIndex = tick % SOLVE_SEQUENCES.length;
  const sequence = SOLVE_SEQUENCES[sequenceIndex];

  useEffect(() => {
    if (reducedMotion) return;
    const id = setInterval(bump, CYCLE_MS);
    return () => clearInterval(id);
  }, [reducedMotion]);

  const rows: { letters: string; pattern: string; empty: boolean }[] = [];
  for (let r = 0; r < TOTAL_ROWS; r++) {
    if (r < sequence.rows.length) {
      rows.push({ ...sequence.rows[r], empty: false });
    } else {
      rows.push({ letters: "     ", pattern: "     ", empty: true });
    }
  }

  return (
    <div className="hero-board-wrapper" aria-hidden="true">
      <div className="hero-board" key={tick}>
        {rows.map((row, ri) => (
          <div className="grid-row" key={ri}>
            {Array.from({ length: 5 }).map((_, ci) => {
              if (row.empty) {
                return <div key={ci} className="grid-cell tile-empty" />;
              }
              const delay = ri * ROW_DELAY + ci * COL_DELAY;
              return (
                <div
                  key={ci}
                  className={tileClass(row.pattern[ci])}
                  data-animate={reducedMotion ? undefined : "true"}
                  style={reducedMotion ? undefined : { "--delay": `${delay}ms` } as React.CSSProperties}
                >
                  {row.letters[ci]}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="hero-board-label" key={`label-${tick}`}>
        {sequence.label}
      </div>
    </div>
  );
}

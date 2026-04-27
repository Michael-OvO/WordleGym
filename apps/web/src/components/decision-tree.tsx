// Search-tree visualization for the home-page showcase.
//
// Each turn is a column of K candidate guesses, scored by the strategy's
// own metric. The chosen candidate of turn N is the *source* that fans out
// to all candidates of turn N+1 — so the tree literally branches from
// each layer's winner. No separate "state" or "pool" nodes: the pool size
// info lives in the candidate-pool strip below the chain.
//
// Animation choreography (per turn, gated on `revealedTurn` advancing in
// the parent showcase):
//   1.   0–340ms : incoming edges from prior winner sweep in (turn ≥ 1)
//   2. 340–820ms : candidate nodes pop in, stagger 70ms
//   3.    950ms  : winner fills with ink, losers dim, ★ appears

import type { ShowcaseTreeTurn } from "@/types/generated";

type Props = {
  trees: ShowcaseTreeTurn[];
  revealedTurn: number; // -1 = nothing yet, then 0..N-1 = that turn revealed
  animationKey: string; // bump to reset animations on demo change
};

// Layout constants (SVG units)
const CAND_W = 100;
const CAND_H = 38;
const CAND_GAP = 6;
const COL_GAP = 96; // horizontal gap between candidate columns
const TOP_PAD = 14;
const LABEL_PAD = 16;
const BOTTOM_PAD = 12;

export function DecisionTree({ trees, revealedTurn, animationKey }: Props) {
  if (!trees.length) return null;

  // Use the maximum top-K across turns so column heights align.
  const k = Math.max(...trees.map((t) => t.top_candidates.length), 5);
  const colH = k * (CAND_H + CAND_GAP) - CAND_GAP;
  const totalH = TOP_PAD + LABEL_PAD + colH + BOTTOM_PAD;
  const colTop = TOP_PAD + LABEL_PAD;

  const colX = (idx: number) => idx * (CAND_W + COL_GAP);
  const candY = (slotIdx: number) =>
    colTop + slotIdx * (CAND_H + CAND_GAP) + CAND_H / 2;

  const totalW = trees.length * CAND_W + (trees.length - 1) * COL_GAP;

  const formatScore = (val: number, m: ShowcaseTreeTurn["metric"]) => {
    const txt = val.toFixed(m.decimals ?? 0);
    return m.unit ? `${txt} ${m.unit}` : txt;
  };

  // Pre-compute chosen index per turn so the next column's incoming edges
  // know where to start.
  const chosenIdxByTurn = trees.map((t) =>
    t.top_candidates.findIndex((c) => c.is_chosen),
  );

  return (
    <div className="dtree" key={animationKey}>
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        width={totalW}
        height={totalH}
        role="img"
        aria-label={`Search tree across ${trees.length} turns: ${trees
          .map((t) => t.chosen.toUpperCase())
          .join(" → ")}`}
      >
        {/* ── Turn column labels ── */}
        {trees.map((tree, idx) => (
          <g key={`label-${idx}`}>
            <text
              x={colX(idx) + CAND_W / 2}
              y={4}
              textAnchor="middle"
              className="dtree-col-label"
            >
              t={tree.turn}
            </text>
            <text
              x={colX(idx) + CAND_W / 2}
              y={4 + 11}
              textAnchor="middle"
              className="dtree-col-label dtree-col-label-light"
            >
              {tree.metric.label} {tree.metric.goal === "min" ? "↓" : "↑"}
            </text>
          </g>
        ))}

        {/* ── Edges fan from chosen-of-turn-(N-1) → all candidates of turn N ── */}
        {trees.slice(1).map((tree, slot) => {
          const idx = slot + 1;
          if (revealedTurn < idx) return null;
          const prevChosen = chosenIdxByTurn[idx - 1];
          if (prevChosen < 0) return null;
          const x1 = colX(idx - 1) + CAND_W;
          const y1 = candY(prevChosen);
          return (
            <g key={`fan-${idx}`} className="dtree-edges">
              {tree.top_candidates.map((c, i) => {
                const x2 = colX(idx);
                const y2 = candY(i);
                const cpx = (x1 + x2) / 2;
                const d = `M ${x1} ${y1} C ${cpx} ${y1}, ${cpx} ${y2}, ${x2} ${y2}`;
                const cls = `dtree-edge${
                  c.is_chosen ? " dtree-edge-winner" : " dtree-edge-loser"
                }`;
                return (
                  <path
                    key={`e-${i}`}
                    className={cls}
                    d={d}
                    style={
                      {
                        ["--edge-draw-delay" as string]: `${100 + i * 30}ms`,
                        ["--edge-fade-delay" as string]: "1000ms",
                      } as React.CSSProperties
                    }
                  />
                );
              })}
            </g>
          );
        })}

        {/* ── Candidate nodes per turn ── */}
        {trees.map((tree, idx) => {
          if (revealedTurn < idx) return null;
          const candidates = tree.top_candidates;
          // Turn 0 has no incoming edges, so its candidates appear sooner.
          const baseDelay = idx === 0 ? 0 : 240;

          return (
            <g key={`turn-${idx}`} className="dtree-turn">
              {candidates.map((c, i) => {
                const cy = candY(i);
                const winner = c.is_chosen;
                const cls = [
                  "dtree-node",
                  "dtree-node-candidate",
                  winner ? "dtree-node-winner" : "dtree-node-loser",
                ].join(" ");
                return (
                  <g
                    key={c.guess}
                    className={cls}
                    style={
                      {
                        ["--anim-delay" as string]: `${baseDelay + 380 + i * 70}ms`,
                        ["--state-delay" as string]: `${baseDelay + 950}ms`,
                      } as React.CSSProperties
                    }
                  >
                    <rect
                      x={colX(idx)}
                      y={cy - CAND_H / 2}
                      width={CAND_W}
                      height={CAND_H}
                      rx="5"
                      ry="5"
                    />
                    <text
                      x={colX(idx) + 7}
                      y={cy - 7}
                      className="dtree-node-rank"
                    >
                      #{c.rank}
                    </text>
                    <text
                      x={colX(idx) + CAND_W / 2}
                      y={cy + 1}
                      textAnchor="middle"
                      className="dtree-node-guess"
                    >
                      {c.guess.toUpperCase()}
                    </text>
                    <text
                      x={colX(idx) + CAND_W / 2}
                      y={cy + 14}
                      textAnchor="middle"
                      className="dtree-node-score"
                    >
                      {formatScore(c.score, tree.metric)}
                    </text>
                    {winner && (
                      <text
                        x={colX(idx) + CAND_W - 8}
                        y={cy - 7}
                        textAnchor="end"
                        className="dtree-node-star"
                        style={
                          {
                            ["--anim-delay" as string]: `${baseDelay + 1050}ms`,
                          } as React.CSSProperties
                        }
                      >
                        ★
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

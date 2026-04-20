import Link from "next/link";

import { STRATEGY_CONTENT } from "@/lib/strategy-content";

const MATH_PREVIEWS: Record<string, string> = {
  "random-valid": "seed = hash(state)",
  "letter-frequency": "score = Σf_pos + 0.4·Σf_global",
  "candidate-elimination": "E[remaining] = Σn²/N",
  "expected-entropy": "H = -Σ(p·log₂p)",
  "minimax": "score = max(|Sₚ|)",
  "posterior-hybrid": "w_std·Ĥ + w_evil·r",
  "evil-shortest-path": "min |T(C,g)|",
  "posterior-expectimax": "q·E[|C|] + (1−q)·|T|",
  "robust-scalarization": "min max(E[|C|], |T|)",
  "evil-dp": "D(C) = min(1 + D(T))",
};

type Props = {
  strategy: { id: string; label: string; objective: string };
};

export function StrategyCard({ strategy }: Props) {
  const content = STRATEGY_CONTENT[strategy.id];
  const tier = content?.tierLabel ?? null;
  const tierClass = content ? `tier-${content.tier}` : "";

  return (
    <Link className="strategy-card" href={`/docs/${strategy.id}`}>
      <div className="strategy-card-header">
        <h3>{strategy.label}</h3>
        {tier && <span className={`tier-badge ${tierClass}`}>{tier}</span>}
      </div>
      <p>{strategy.objective}</p>
      <span className="math-preview">
        {MATH_PREVIEWS[strategy.id] ?? "—"}
      </span>
      <span className="strategy-card-arrow" aria-hidden="true">
        &rarr;
      </span>
    </Link>
  );
}

import Link from "next/link";

const MATH_PREVIEWS: Record<string, string> = {
  "random-valid": "seed = hash(state)",
  "letter-frequency": "score = Σf_pos + 0.4·Σf_global",
  "candidate-elimination": "E[remaining] = Σn²/N",
  "expected-entropy": "H = -Σ(p·log₂p)",
  "minimax": "score = max(|Sₚ|)",
  "adaptive-robust": "w_std·H + w_evil·r",
};

type Props = {
  strategy: { id: string; label: string; objective: string };
};

export function StrategyCard({ strategy }: Props) {
  return (
    <Link className="strategy-card" href={`/docs/${strategy.id}`}>
      <h3>{strategy.label}</h3>
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

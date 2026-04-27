import Link from "next/link";

import { MathBlock } from "@/components/math";
import { STRATEGY_CONTENT } from "@/lib/strategy-content";
import { STRATEGY_FORMULAS } from "@/lib/strategy-previews";
import type { StrategyTier } from "@/types/generated";

// Single-word descriptor per tier. Keeps the kicker rail tight.
const TIER_DESCRIPTOR: Record<StrategyTier, string> = {
  baseline: "Control",
  core: "One-ply partition",
  experimental: "Mode-aware",
  "aggregate-aware": "Practical-candidate",
  optimal: "Exact DP",
};

export type StrategyCardStats = {
  standardAvg: number;
  evilDepth: number;
  worst: number;
};

type Props = {
  strategy: { id: string; label: string; objective: string };
  index?: number;
  stats?: StrategyCardStats;
};

export function StrategyCard({ strategy, index, stats }: Props) {
  const content = STRATEGY_CONTENT[strategy.id];
  const tier = content?.tier ?? null;
  const tierLabel = content?.tierLabel ?? null;
  const tierDescriptor = tier ? TIER_DESCRIPTOR[tier] : null;
  const formula = STRATEGY_FORMULAS[strategy.id];
  const isOptimal = tier === "optimal";

  return (
    <Link
      className={`strategy-card${isOptimal ? " strategy-card-optimal" : ""}`}
      href={`/docs/${strategy.id}`}
    >
      <header className="strategy-card-kicker">
        {typeof index === "number" && (
          <span className="strategy-card-index">
            {index.toString().padStart(2, "0")}
          </span>
        )}
        <span className="strategy-card-kicker-rule" aria-hidden="true" />
        {tierLabel && (
          <span className={`strategy-card-tier${tier ? ` tier-${tier}` : ""}`}>
            {tierLabel}
          </span>
        )}
        {tierDescriptor && (
          <>
            <span className="strategy-card-kicker-dot" aria-hidden="true">
              /
            </span>
            <span className="strategy-card-tier-descriptor">
              {tierDescriptor}
            </span>
          </>
        )}
      </header>

      <div className="strategy-card-head">
        <h3>{strategy.label}</h3>
        <code className="strategy-card-id">{strategy.id}</code>
      </div>

      {formula && (
        <div className="strategy-card-formula" aria-hidden="true">
          <MathBlock formula={formula} />
        </div>
      )}

      <p className="strategy-card-desc">{strategy.objective}</p>

      {stats && (
        <dl className="strategy-card-stats">
          <div>
            <dt>Std avg</dt>
            <dd>{stats.standardAvg.toFixed(2)}</dd>
          </div>
          <div
            className={
              isOptimal
                ? "strategy-card-stat strategy-card-stat-accent"
                : "strategy-card-stat"
            }
          >
            <dt>Evil depth</dt>
            <dd>{stats.evilDepth.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Worst</dt>
            <dd>{stats.worst}</dd>
          </div>
        </dl>
      )}
    </Link>
  );
}

import { StrategyCard } from "@/components/strategy-card";
import { getManifest, getSummaries } from "@/lib/generated-data";
import {
  BENCHMARK_DISCLAIMER,
  STRATEGIES_BY_TIER,
  STRATEGY_CONTENT,
  TIER_METADATA,
  TIER_ORDER,
} from "@/lib/strategy-content";

export default async function DocsIndexPage() {
  const [manifest, summaries] = await Promise.all([getManifest(), getSummaries()]);
  const manifestById = Object.fromEntries(manifest.strategies.map((s) => [s.id, s]));
  const stdById = Object.fromEntries(
    (summaries.standard ?? []).map((r) => [r.strategy_id, r]),
  );
  const evilById = Object.fromEntries(
    (summaries.evil ?? []).map((r) => [r.strategy_id, r]),
  );
  const statsFor = (id: string) => {
    const std = stdById[id];
    const evil = evilById[id];
    if (!std && !evil) return undefined;
    return {
      standardAvg: std?.average_guesses ?? 0,
      evilDepth: evil?.average_guesses ?? 0,
      worst: std?.worst_case ?? 0,
    };
  };

  return (
    <main className="page-shell page-tight">
      <div className="doc-prose">
        <p className="eyebrow">Research</p>
        <h1>Strategy Documentation</h1>
        <p className="doc-subtitle">
          Benchmark policies for Wordle play, organized by documentation tier.
          Each page covers the local objective, math, pseudocode, and honest caveats —
          from reproducible baselines through one-ply partition heuristics to an
          exact Evil-mode dynamic program.
        </p>
        <p className="doc-disclaimer">{BENCHMARK_DISCLAIMER}</p>
      </div>

      {TIER_ORDER.map((tier) => {
        const ids = STRATEGIES_BY_TIER[tier] ?? [];
        if (!ids.length) return null;
        const meta = TIER_METADATA[tier];
        return (
          <section key={tier} className="strategy-tier">
            <header className="strategy-tier-header">
              <h2>{meta.label}</h2>
              <p>{meta.description}</p>
            </header>
            <div className="strategy-grid">
              {ids.map((id) => {
                const content = STRATEGY_CONTENT[id];
                const manifestEntry = manifestById[id];
                const label = content?.title ?? manifestEntry?.label ?? id;
                const objective =
                  content?.subtitle ?? manifestEntry?.objective ?? "";
                return (
                  <StrategyCard
                    key={id}
                    strategy={{ id, label, objective }}
                    stats={statsFor(id)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}

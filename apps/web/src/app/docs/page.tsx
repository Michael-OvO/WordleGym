import Link from "next/link";

import { getManifest } from "@/lib/generated-data";
import {
  BENCHMARK_DISCLAIMER,
  STRATEGIES_BY_TIER,
  STRATEGY_CONTENT,
  TIER_METADATA,
  TIER_ORDER,
} from "@/lib/strategy-content";

export default async function DocsIndexPage() {
  const manifest = await getManifest();
  const manifestById = Object.fromEntries(manifest.strategies.map((s) => [s.id, s]));

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
                const subtitle = content?.subtitle ?? manifestEntry?.objective ?? "";
                return (
                  <Link key={id} className={`strategy-card tier-${tier}`} href={`/docs/${id}`}>
                    <div className="strategy-card-header">
                      <h3>{label}</h3>
                      <span className={`tier-badge tier-${tier}`}>{content?.tierLabel ?? meta.label}</span>
                    </div>
                    <p>{subtitle}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}

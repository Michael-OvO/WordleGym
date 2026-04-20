import Link from "next/link";

import { getManifest } from "@/lib/generated-data";
import { STRATEGY_CONTENT } from "@/lib/strategy-content";

export default async function DocsIndexPage() {
  const manifest = await getManifest();

  return (
    <main className="page-shell page-tight">
      <div className="doc-prose">
        <p className="eyebrow">Research</p>
        <h1>Strategy Documentation</h1>
        <p className="doc-subtitle">
          Six information-theoretic and heuristic strategies for optimal Wordle play.
          Each page covers the algorithm design, mathematical formulation, pseudocode,
          and trade-offs — from a baseline random player to a Bayesian adaptive solver.
        </p>
      </div>

      <div className="strategy-grid">
        {manifest.strategies.map((s) => {
          const content = STRATEGY_CONTENT[s.id];
          return (
            <Link key={s.id} className="strategy-card" href={`/docs/${s.id}`}>
              <h3>{s.label}</h3>
              <p>{content?.subtitle ?? s.objective}</p>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

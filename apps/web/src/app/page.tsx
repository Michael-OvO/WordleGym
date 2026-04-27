import Link from "next/link";

import { AlgorithmWalkthroughs } from "@/components/algorithm-walkthroughs";
import { ExperimentsPreview } from "@/components/experiments-preview";
import { ResultsExplorer } from "@/components/results-explorer";
import { Simulator } from "@/components/simulator";
import { StrategyCard } from "@/components/strategy-card";
import { StrategyShowcase } from "@/components/strategy-showcase";
import { WorkedExamples } from "@/components/worked-examples";
import { buildStrategyDemos } from "@/lib/strategy-demos";
import {
  getDecisionSnapshots,
  getManifest,
  getRobustness,
  getSampleReplays,
  getSimulator,
  getSummaries,
  getWalkthroughs,
} from "@/lib/generated-data";

export default async function HomePage() {
  const [manifest, summaries, robustness, decisions, replays, walkthroughs, simulator] =
    await Promise.all([
      getManifest(),
      getSummaries(),
      getRobustness(),
      getDecisionSnapshots(),
      getSampleReplays(),
      getWalkthroughs(),
      getSimulator(),
    ]);

  const bestStandard = summaries.standard[0];
  const bestEvil = summaries.evil[0];

  const stdById = Object.fromEntries(
    (summaries.standard ?? []).map((row) => [row.strategy_id, row]),
  );
  const evilById = Object.fromEntries(
    (summaries.evil ?? []).map((row) => [row.strategy_id, row]),
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

  const showcaseDemos = buildStrategyDemos(manifest, summaries, replays, walkthroughs);

  return (
    <main className="page-shell">
      {/* ─── 1. Hero ─── */}
      <section className="hero hero-stacked">
        <div className="hero-copy">
          <p className="eyebrow">Strategy Research</p>
          <h1>Benchmarking optimal play under uncertainty</h1>
          <p className="hero-text">
            Tiered strategies — from reproducible baselines through one-ply
            partition heuristics to an exact Evil-mode dynamic program —
            evaluated across standard, adversarial, and latent-mode Wordle
            environments. Play games, replay solver traces, and compare
            behavioral profiles.
          </p>
          <div className="hero-actions">
            <Link className="primary-button" href="/play/standard">
              Open playground
            </Link>
            <Link className="secondary-button" href="/docs">
              Read the research
            </Link>
          </div>
        </div>
        {showcaseDemos.length > 0 && (
          <StrategyShowcase demos={showcaseDemos} />
        )}
      </section>

      {/* ─── Stats strip ─── */}
      <div className="stats-strip">
        <div className="stat-item">
          <strong>{manifest.answers.toLocaleString()}</strong>
          <span>Target words</span>
        </div>
        <div className="stat-item">
          <strong>{manifest.strategies.length}</strong>
          <span>Strategies</span>
        </div>
        <div className="stat-item">
          <strong>{bestStandard ? bestStandard.average_guesses.toFixed(2) : "—"}</strong>
          <span>Best standard avg</span>
        </div>
        <div className="stat-item">
          <strong>{bestEvil ? bestEvil.worst_case : "—"}</strong>
          <span>Evil DP optimum</span>
        </div>
      </div>

      {/* ─── 2. Environments ─── */}
      <section className="mode-strip">
        <Link className="mode-panel" href="/play/standard">
          <p className="eyebrow">Standard</p>
          <h2>Fixed target</h2>
          <p>Classic Wordle against a fixed hidden answer. Optimize for average guesses.</p>
        </Link>
        <Link className="mode-panel" href="/play/evil">
          <p className="eyebrow">Evil</p>
          <h2>Adversarial</h2>
          <p>The target shifts to maximize remaining answers. Worst-case resilience matters.</p>
        </Link>
        <Link className="mode-panel" href="/play/unknown">
          <p className="eyebrow">Unknown</p>
          <h2>Latent inference</h2>
          <p>Is the environment standard or evil? The solver must infer the mode via Bayesian posterior.</p>
        </Link>
      </section>

      {/* ─── 3. Worked examples (paired with the paper) ─── */}
      <WorkedExamples />

      {/* ─── 4. Algorithm walkthroughs (multi-algo + per-strategy cases) ─── */}
      <AlgorithmWalkthroughs
        replays={replays}
        summaries={summaries}
        manifest={manifest}
      />

      {/* ─── 4.5 Interactive simulator ─── */}
      {simulator && simulator.cases.length > 0 && <Simulator payload={simulator} />}

      {/* ─── 5. Strategy Index ─── */}
      <section>
        <div className="section-header">
          <p className="eyebrow">Algorithms</p>
          <h2>Strategy index</h2>
          <p>From random baselines to Bayesian adaptive solvers — each with a deep-dive tutorial on the math.</p>
        </div>
        <div className="strategy-grid">
          {manifest.strategies.map((s, i) => (
            <StrategyCard
              key={s.id}
              strategy={s}
              index={i + 1}
              stats={statsFor(s.id)}
            />
          ))}
        </div>
      </section>

      {/* ─── 4. Experiments ─── */}
      <ExperimentsPreview summaries={summaries} replays={replays} />

      {/* ─── 5. Results Explorer ─── */}
      <ResultsExplorer decisions={decisions} replays={replays} robustness={robustness} summaries={summaries} />
    </main>
  );
}

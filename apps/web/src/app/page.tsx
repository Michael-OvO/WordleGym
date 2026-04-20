import Link from "next/link";

import { CascadingBoard } from "@/components/cascading-board";
import { ExperimentsPreview } from "@/components/experiments-preview";
import { ResultsExplorer } from "@/components/results-explorer";
import { StrategyCard } from "@/components/strategy-card";
import { getDecisionSnapshots, getManifest, getRobustness, getSampleReplays, getSummaries } from "@/lib/generated-data";

export default async function HomePage() {
  const [manifest, summaries, robustness, decisions, replays] = await Promise.all([
    getManifest(),
    getSummaries(),
    getRobustness(),
    getDecisionSnapshots(),
    getSampleReplays(),
  ]);

  const bestStandard = summaries.standard[0];
  const bestEvil = summaries.evil[0];

  return (
    <main className="page-shell">
      {/* ─── 1. Hero ─── */}
      <section className="hero">
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
        <CascadingBoard />
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

      {/* ─── Evil-DP headline callout ─── */}
      {bestEvil && (
        <section className="finding-callout">
          <div>
            <p className="eyebrow">Headline finding</p>
            <h2>
              <code>evil-dp</code> solves Evil Wordle in <strong>{bestEvil.worst_case}</strong> turns —
              one full guess better than every greedy strategy
            </h2>
            <p>
              The exact dynamic program over the deterministic evil subset graph recovers
              D(A) = {bestEvil.worst_case}. The spec&apos;s eight non-random deterministic heuristics
              all tie at 5. Opening guess: <code>raise</code>.
            </p>
            <div className="hero-actions">
              <Link className="secondary-button" href="/docs/evil-dp">
                Evil DP strategy card
              </Link>
              <Link className="ghost-button" href="/results">
                See all benchmark results
              </Link>
            </div>
          </div>
        </section>
      )}

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

      {/* ─── 3. Strategy Index ─── */}
      <section>
        <div className="section-header">
          <p className="eyebrow">Algorithms</p>
          <h2>Strategy index</h2>
          <p>From random baselines to Bayesian adaptive solvers — each with a deep-dive tutorial on the math.</p>
        </div>
        <div className="strategy-grid">
          {manifest.strategies.map((s) => (
            <StrategyCard key={s.id} strategy={s} />
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

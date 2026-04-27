// Algorithm walkthroughs: per-strategy signature games + multi-algorithm
// head-to-head case study on ABACK.
//
// Two halves:
//   A. Multi-algo head-to-head — same hidden answer (ABACK, Unknown mode)
//      played by all ten policies, side-by-side. The visual is a 10-column
//      small-multiples grid where solve depth is immediately legible.
//   B. Per-strategy walkthroughs — each algorithm plays its own signature
//      game, with hand-written turn-by-turn narrative explaining what the
//      policy did and why. Live numeric stats (entropy, |T|, expected
//      remaining, etc.) are pulled from the engine's sample-replays
//      explanation fields so they stay in sync if the benchmark regenerates.

import { STRATEGY_CONTENT, type StrategySection } from "@/lib/strategy-content";
import {
  STRATEGY_CASES,
  STRATEGY_CASE_ORDER,
  type StrategyCase,
  type WalkthroughMode,
} from "@/lib/strategy-walkthroughs";
import type {
  ManifestPayload,
  ReplayTrace,
  SampleReplayPayload,
  SummariesPayload,
} from "@/types/generated";

// ── Tile rendering (reuses .wx-tile from globals.css) ────────────────
type TileState = "G" | "Y" | "B" | "";

function tileClass(state: TileState): string {
  if (state === "G") return "wx-tile tile-G";
  if (state === "Y") return "wx-tile tile-Y";
  if (state === "B") return "wx-tile tile-B";
  return "wx-tile tile-empty";
}

function TileRow({ guess, pattern }: { guess: string; pattern: string }) {
  const letters = guess.padEnd(5, " ").slice(0, 5).toUpperCase().split("");
  const states = pattern.padEnd(5, "").slice(0, 5).split("") as TileState[];
  return (
    <div className="wx-row">
      {letters.map((letter, i) => (
        <div key={i} className={tileClass(states[i] ?? "")}>
          <span>{letter.trim()}</span>
        </div>
      ))}
    </div>
  );
}

// Compact tile row used in the side-by-side small-multiples grid. Half the
// size of the full TileRow above, so 10 strategies fit in one viewport.
function MiniTileRow({ guess, pattern }: { guess: string; pattern: string }) {
  const letters = guess.padEnd(5, " ").slice(0, 5).toUpperCase().split("");
  const states = pattern.padEnd(5, "").slice(0, 5).split("") as TileState[];
  return (
    <div className="awx-mini-row">
      {letters.map((letter, i) => {
        const s = states[i];
        const cls = `awx-mini-tile awx-tile-${s || "E"}`;
        return (
          <div key={i} className={cls}>
            <span>{letter.trim()}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Live-stat extraction from replay step explanations ───────────────
function readNum(e: Record<string, unknown> | undefined, key: string): number | null {
  if (!e) return null;
  const v = e[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Render a per-turn live-stats line. Pulls the right fields from the
// explanation block based on the strategy's local objective.
function StatLine({ strategyId, step }: { strategyId: string; step: ReplayTrace["steps"][number] }) {
  const e = step.explanation as Record<string, unknown> | undefined;
  const entropy = readNum(e, "entropy");
  const expRem = readNum(e, "expected_remaining");
  const worst = readNum(e, "worst_case");
  const evilT = readNum(e, "evil_forced_bucket");
  const stats: { label: string; value: string }[] = [];

  switch (strategyId) {
    case "expected-entropy":
      if (entropy != null) stats.push({ label: "H", value: `${entropy.toFixed(2)} bits` });
      if (expRem != null) stats.push({ label: "E[rem]", value: expRem.toFixed(1) });
      break;
    case "candidate-elimination":
      if (expRem != null) stats.push({ label: "E[rem]", value: expRem.toFixed(1) });
      if (entropy != null) stats.push({ label: "H", value: `${entropy.toFixed(2)} bits` });
      break;
    case "minimax":
      if (worst != null) stats.push({ label: "worst bucket", value: String(worst) });
      if (entropy != null) stats.push({ label: "H", value: `${entropy.toFixed(2)} bits` });
      break;
    case "evil-dp":
    case "evil-shortest-path":
    case "robust-scalarization":
    case "posterior-expectimax":
      if (evilT != null) stats.push({ label: "|T|", value: String(evilT) });
      if (entropy != null) stats.push({ label: "H", value: `${entropy.toFixed(2)} bits` });
      break;
    case "posterior-hybrid":
      if (entropy != null) stats.push({ label: "H", value: `${entropy.toFixed(2)} bits` });
      if (worst != null) stats.push({ label: "worst", value: String(worst) });
      break;
    case "letter-frequency":
      if (entropy != null) stats.push({ label: "H", value: `${entropy.toFixed(2)} bits` });
      break;
    case "random-valid":
      // No metric — random-valid doesn't optimize anything
      break;
  }

  if (stats.length === 0) {
    return <span className="awx-stat-line awx-stat-empty">—</span>;
  }
  return (
    <span className="awx-stat-line">
      {stats.map((s, i) => (
        <span key={i} className="awx-stat-item">
          <span className="awx-stat-label">{s.label}</span>
          <span className="awx-stat-value">{s.value}</span>
        </span>
      ))}
    </span>
  );
}

// ── Header tier badge ────────────────────────────────────────────────
function tierClass(tier: StrategySection["tier"]): string {
  return `awx-tier-badge awx-tier-${tier}`;
}

// ── Multi-algo head-to-head: small multiples on ABACK ────────────────
function MultiAlgoComparison({ replays }: { replays: SampleReplayPayload }) {
  const unknownReplays = replays.unknown ?? {};
  // Order strategies by solve depth ascending so the visual sweeps from
  // fastest to slowest — the natural reading direction.
  const ordered = STRATEGY_CASE_ORDER.map((id) => {
    const replay = unknownReplays[id];
    return { id, replay };
  })
    .filter((x): x is { id: string; replay: ReplayTrace } => x.replay != null)
    .sort((a, b) => a.replay.turns - b.replay.turns);

  if (ordered.length === 0) return null;

  return (
    <div className="awx-multialgo">
      <header className="awx-multialgo-head">
        <h3>One answer, ten trajectories</h3>
        <p>
          Same hidden answer, same feedback rules, same starting candidate
          pool of 2,315 words. Every strategy plays{" "}
          <strong>ABACK</strong> in Unknown mode. Solve depth varies from{" "}
          <strong>3</strong> turns (<code>minimax</code>) to{" "}
          <strong>5</strong> turns (<code>letter-frequency</code> and{" "}
          <code>random-valid</code>) — entirely because of which one-step
          quantity each policy optimizes.
        </p>
      </header>

      <div className="awx-multialgo-grid">
        {ordered.map(({ id, replay }) => {
          const content = STRATEGY_CONTENT[id];
          const turns = replay.turns;
          const turnLabel = turns === 3 ? "fastest" : turns === 5 ? "slowest" : "";
          return (
            <article key={id} className="awx-mini-card">
              <header className="awx-mini-head">
                <div className="awx-mini-name-row">
                  <code className="awx-mini-name">{id}</code>
                  {content && (
                    <span className={tierClass(content.tier)}>
                      {content.tierLabel}
                    </span>
                  )}
                </div>
                <div className="awx-mini-turns">
                  <strong>{turns}</strong>
                  <span>turn{turns === 1 ? "" : "s"}</span>
                  {turnLabel && (
                    <span className="awx-mini-turns-flag">{turnLabel}</span>
                  )}
                </div>
              </header>
              <div className="awx-mini-grid">
                {Array.from({ length: 5 }).map((_, ri) => {
                  const step = replay.steps[ri];
                  if (!step) {
                    return (
                      <MiniTileRow key={ri} guess="     " pattern="     " />
                    );
                  }
                  return (
                    <MiniTileRow
                      key={ri}
                      guess={step.guess}
                      pattern={step.pattern_text}
                    />
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>

      <footer className="awx-multialgo-foot">
        <p>
          The fastest path (<code>minimax</code>) gets lucky on this answer:
          its turn-2 probe <code>CLOUT</code> happens to isolate{" "}
          <code>ABACK</code> as a singleton. Across the full 2,315-game
          benchmark <code>minimax</code> averages{" "}
          <strong>3.573</strong> guesses — worse than every entropy-style
          policy. Per-game variance dwarfs the average gap between
          strategies.
        </p>
      </footer>
    </div>
  );
}

// ── Per-strategy walkthrough card ────────────────────────────────────
function StrategyCard({
  caseSpec,
  replay,
  summary,
}: {
  caseSpec: StrategyCase;
  replay: ReplayTrace | undefined;
  summary?: SummariesPayload[WalkthroughMode][number];
}) {
  if (!replay) return null;
  const content = STRATEGY_CONTENT[caseSpec.strategyId];
  const modeLabel =
    caseSpec.mode === "evil"
      ? "Evil (deterministic)"
      : caseSpec.mode === "unknown"
      ? "Unknown (mode hidden)"
      : "Standard";

  return (
    <article className="awx-card" id={`walkthrough-${caseSpec.strategyId}`}>
      <header className="awx-card-head">
        <div className="awx-card-title-row">
          <h3>
            <code>{caseSpec.strategyId}</code>
          </h3>
          {content && (
            <span className={tierClass(content.tier)}>{content.tierLabel}</span>
          )}
        </div>
        <p className="awx-card-hook">{caseSpec.hook}</p>
        <div className="awx-card-meta">
          <span className="awx-card-meta-item">
            <span className="awx-card-meta-label">mode</span>
            <span className="awx-card-meta-value">{modeLabel}</span>
          </span>
          {replay.hidden_answer && (
            <span className="awx-card-meta-item">
              <span className="awx-card-meta-label">answer</span>
              <code className="awx-card-meta-value">
                {replay.hidden_answer.toUpperCase()}
              </code>
            </span>
          )}
          <span className="awx-card-meta-item">
            <span className="awx-card-meta-label">turns</span>
            <span className="awx-card-meta-value">
              <strong>{replay.turns}</strong>
            </span>
          </span>
          {summary && (
            <span className="awx-card-meta-item">
              <span className="awx-card-meta-label">benchmark avg</span>
              <span className="awx-card-meta-value">
                {summary.average_guesses.toFixed(3)}
              </span>
            </span>
          )}
        </div>
      </header>

      <div className="awx-card-body">
        {/* Left: full-size tile board */}
        <div className="awx-card-board">
          {Array.from({ length: 6 }).map((_, ri) => {
            const step = replay.steps[ri];
            if (!step) {
              return <TileRow key={ri} guess="     " pattern="     " />;
            }
            return (
              <TileRow
                key={ri}
                guess={step.guess}
                pattern={step.pattern_text}
              />
            );
          })}
        </div>

        {/* Right: per-turn narrative */}
        <ol className="awx-card-narrative">
          {replay.steps.map((step) => (
            <li key={step.turn} className="awx-narrative-step">
              <header className="awx-narrative-head">
                <span className="awx-narrative-turn">t={step.turn}</span>
                <code className="awx-narrative-guess">
                  {step.guess.toUpperCase()}
                </code>
                <span className="awx-narrative-decay">
                  <strong>{step.remaining_candidates.toLocaleString()}</strong>
                  <span className="awx-narrative-decay-label">
                    {step.remaining_candidates === 1 ? "answer" : "answers"} left
                  </span>
                </span>
                <StatLine strategyId={caseSpec.strategyId} step={step} />
              </header>
              <p className="awx-narrative-prose">
                {caseSpec.perTurn[step.turn] ?? null}
              </p>
            </li>
          ))}
        </ol>
      </div>

      <footer className="awx-card-foot">
        <p className="awx-card-takeaway">
          <span className="awx-card-takeaway-label">Takeaway · </span>
          {caseSpec.takeaway}
        </p>
      </footer>
    </article>
  );
}

// ── Top-level component ──────────────────────────────────────────────
export function AlgorithmWalkthroughs({
  replays,
  summaries,
}: {
  replays: SampleReplayPayload;
  summaries: SummariesPayload;
  manifest: ManifestPayload;
}) {
  const sumByMode: Record<WalkthroughMode, Map<string, SummariesPayload[WalkthroughMode][number]>> = {
    standard: new Map(summaries.standard.map((s) => [s.strategy_id, s])),
    evil: new Map(summaries.evil.map((s) => [s.strategy_id, s])),
    unknown: new Map(summaries.unknown.map((s) => [s.strategy_id, s])),
  };

  return (
    <section className="algorithm-walkthroughs">
      <div className="section-header">
        <p className="eyebrow">Algorithm walkthroughs</p>
        <h2>What each policy actually does, turn by turn</h2>
        <p>
          Average solve depth tells you who wins on a leaderboard. To
          understand <em>why</em>, you have to watch each algorithm play.
          First a side-by-side on a single hidden answer; then ten
          single-strategy walkthroughs in the modes that best showcase
          their design choices.
        </p>
      </div>

      {/* ── A · Multi-algorithm head-to-head ── */}
      <MultiAlgoComparison replays={replays} />

      {/* ── B · Per-strategy walkthroughs ── */}
      <div className="awx-cards">
        <header className="awx-cards-head">
          <h3>Ten strategies, ten signature games</h3>
          <p>
            Each card shows the strategy in the mode where its local
            objective is most visible — Standard for entropy and
            candidate-elim., Evil for the DP, Unknown for the mode-aware
            hybrids. Live stats (H, |T|, E[remaining]) come from the
            engine&apos;s explanation fields per turn.
          </p>
        </header>
        {STRATEGY_CASES.map((caseSpec) => {
          const replay = replays[caseSpec.mode]?.[caseSpec.strategyId];
          const summary = sumByMode[caseSpec.mode].get(caseSpec.strategyId);
          return (
            <StrategyCard
              key={caseSpec.strategyId}
              caseSpec={caseSpec}
              replay={replay}
              summary={summary}
            />
          );
        })}
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";

import { DecisionTree } from "@/components/decision-tree";
import { MathBlock } from "@/components/math";
import type { StrategyDemo } from "@/lib/strategy-demos";

// ── Animation timings ────────────────────────────────────────────────
// Each turn unlocks ROW_DELAY_MS after the previous one; the tile
// cascade itself is 380ms (matches the existing .grid-cell animation).
const ROW_DELAY_MS = 820;
const TILE_STAGGER_MS = 70;
const HOLD_AFTER_LAST_MS = 2400;
const FADE_BETWEEN_DEMOS_MS = 320;

type Props = {
  demos: StrategyDemo[];
};

function tileClass(letter: string): string {
  if (letter === "G") return "grid-cell tile-G";
  if (letter === "Y") return "grid-cell tile-Y";
  if (letter === "B") return "grid-cell tile-B";
  return "grid-cell tile-empty";
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

export function StrategyShowcase({ demos }: Props) {
  const [demoIndex, setDemoIndex] = useState(0);
  // -1 = no rows revealed yet; 0..N-1 = that many rows revealed
  const [revealedTurn, setRevealedTurn] = useState(-1);
  const [transitioning, setTransitioning] = useState(false);
  const reducedMotion = useReducedMotion();

  // Compute the active demo even when the list is empty — fall back to a
  // sentinel so hooks below run unconditionally; we render `null` later.
  const activeDemo = demos.length > 0 ? demos[demoIndex % demos.length] : null;
  const totalTurns = activeDemo?.trace.length ?? 0;

  useEffect(() => {
    if (!activeDemo || totalTurns === 0) return;
    if (reducedMotion) {
      setRevealedTurn(totalTurns - 1);
      return;
    }
    setTransitioning(false);
    setRevealedTurn(-1);
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    for (let i = 0; i < totalTurns; i++) {
      timeouts.push(
        setTimeout(() => setRevealedTurn(i), ROW_DELAY_MS * (i + 1)),
      );
    }
    timeouts.push(
      setTimeout(() => {
        setTransitioning(true);
      }, ROW_DELAY_MS * totalTurns + HOLD_AFTER_LAST_MS),
    );
    timeouts.push(
      setTimeout(
        () => setDemoIndex((idx) => (idx + 1) % demos.length),
        ROW_DELAY_MS * totalTurns + HOLD_AFTER_LAST_MS + FADE_BETWEEN_DEMOS_MS,
      ),
    );
    return () => timeouts.forEach(clearTimeout);
  }, [activeDemo, demoIndex, totalTurns, reducedMotion, demos.length]);

  if (!activeDemo) return null;
  const demo = activeDemo;
  const shownSteps = demo.trace.slice(0, revealedTurn + 1);
  const finished = revealedTurn >= totalTurns - 1;
  // Strategies with a partition-based metric have a per-turn `tree`. Build
  // the chain by collecting non-null trees in turn order. If the demo has
  // no trees (e.g. random-valid), `treesForChain` is empty and the search-
  // tree panel is suppressed.
  const treesForChain = demo.trace
    .map((s) => s.tree)
    .filter((t): t is NonNullable<typeof t> => t != null);

  return (
    <section
      className={`showcase${transitioning ? " showcase-leaving" : ""}`}
      aria-live="polite"
    >
      {/* ── Header ─────────────────────────────── */}
      <header className="showcase-head">
        <div className="showcase-head-left">
          <span className="showcase-eyebrow">Live policy comparison</span>
          <div className="showcase-title-row">
            <h3 className="showcase-name" data-tier={demo.tier ?? ""}>
              {demo.label}
            </h3>
            {demo.tierLabel && (
              <span className={`tier-badge tier-${demo.tier ?? "baseline"}`}>
                {demo.tierLabel}
              </span>
            )}
          </div>
          <code className="showcase-id">{demo.id}</code>
        </div>
        <div className="showcase-head-right">
          {demo.hiddenAnswer && (
            <div className="showcase-meta">
              <span className="showcase-meta-label">target</span>
              <code className="showcase-meta-value">
                {demo.hiddenAnswer.toUpperCase()}
              </code>
            </div>
          )}
          <div className="showcase-meta">
            <span className="showcase-meta-label">turn</span>
            <span className="showcase-meta-value">
              {Math.max(revealedTurn + 1, 0)} / {totalTurns}
            </span>
          </div>
        </div>
      </header>

      {/* ── Body: board + panel ───────────────── */}
      <div className="showcase-body">
        {/* Board */}
        <div className="showcase-board" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, ri) => {
            const step = ri <= revealedTurn ? demo.trace[ri] : null;
            const guess = step ? step.guess.padEnd(5, " ").slice(0, 5) : "     ";
            const pattern = step ? step.pattern.padEnd(5, "B") : "     ";
            const animKey = `${demo.id}-${ri}-${revealedTurn}`;
            return (
              <div className="grid-row" key={animKey}>
                {Array.from({ length: 5 }).map((_, ci) => {
                  if (!step) {
                    return (
                      <div key={ci} className="grid-cell tile-empty" />
                    );
                  }
                  const letter = pattern[ci];
                  return (
                    <div
                      key={ci}
                      className={tileClass(letter)}
                      data-animate={reducedMotion ? undefined : "true"}
                      style={
                        reducedMotion
                          ? undefined
                          : ({ "--delay": `${ci * TILE_STAGGER_MS}ms` } as React.CSSProperties)
                      }
                    >
                      {guess[ci].trim()}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Panel */}
        <div className="showcase-panel">
          {/* Objective formula */}
          {demo.formula && (
            <div className="showcase-objective">
              <span className="showcase-eyebrow">Objective</span>
              <div className="showcase-formula">
                <MathBlock formula={demo.formula} />
              </div>
              {demo.objective && (
                <p className="showcase-objective-text">{demo.objective}</p>
              )}
            </div>
          )}

          {/* Search tree — single connected SVG that grows turn-by-turn
              as `revealedTurn` advances. Falls back to the per-turn pool
              chip strip below if the strategy has no tree data. */}
          {treesForChain.length > 0 && (
            <div className="showcase-tree">
              <span className="showcase-eyebrow">
                Search tree · how the policy chooses
              </span>
              <DecisionTree
                trees={treesForChain}
                revealedTurn={revealedTurn}
                animationKey={demo.id}
              />
            </div>
          )}

          {/* Per-turn candidate-pool chips — what answers are still possible
              entering and leaving each turn. The tree above shows GUESSES;
              this strip shows ANSWERS. */}
          <div className="showcase-progression">
            <span className="showcase-eyebrow">Candidate pool by turn</span>
            <ol className="dp-progression-list">
              {shownSteps.map((step) => (
                <li key={step.turn} className="dp-progression-item dp-progression-item-compact">
                  <header className="dp-progression-head">
                    <span className="dp-progression-turn">t={step.turn}</span>
                    <span className="dp-progression-decay">
                      <strong>{step.remainingBefore.toLocaleString()}</strong>
                      <span className="dp-progression-arrow" aria-hidden="true">→</span>
                      <strong>{step.remainingAfter.toLocaleString()}</strong>
                      <span className="dp-progression-decay-label">answers</span>
                    </span>
                    <span className="dp-progression-guess-inline">
                      <span className="dp-progression-chose">chose</span>
                      <code className="dp-progression-guess">{step.guess}</code>
                      <FbDots pattern={step.pattern} />
                    </span>
                  </header>

                  <div className="dp-progression-pool dp-progression-pool-after">
                    <span className="dp-progression-pool-label">survivors</span>
                    {step.poolAfterPreview.length > 0 ? (
                      <ChipCloud
                        words={step.poolAfterPreview}
                        total={step.remainingAfter}
                      />
                    ) : (
                      <span className="dp-progression-pool-all">
                        {step.remainingAfter}{" "}
                        {step.remainingAfter === 1 ? "answer" : "answers"} survive
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Aggregate stats — fade in once trace is complete */}
          {demo.stats && (
            <dl
              className={`showcase-stats${finished ? " is-shown" : ""}`}
              aria-live="off"
            >
              <div>
                <dt>Std avg</dt>
                <dd>{demo.stats.standardAvg.toFixed(3)}</dd>
              </div>
              <div>
                <dt>Std worst</dt>
                <dd>{demo.stats.standardWorst}</dd>
              </div>
              <div>
                <dt>Solve</dt>
                <dd>{(demo.stats.standardSolveRate * 100).toFixed(0)}%</dd>
              </div>
              <div>
                <dt>Evil depth</dt>
                <dd>
                  {demo.stats.evilDepth > 0 ? demo.stats.evilDepth.toFixed(2) : "—"}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </div>

      {/* Pagination dots — also act as buttons */}
      <div className="showcase-pager" role="tablist" aria-label="Strategy showcase">
        {demos.map((d, i) => {
          const active = i === demoIndex % demos.length;
          return (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={d.label}
              className={`showcase-dot${active ? " is-active" : ""}`}
              onClick={() => setDemoIndex(i)}
            >
              <span className="showcase-dot-label">{d.id}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ─── Small helpers ──────────────────────────────────────────────────
function FbDots({ pattern }: { pattern: string }) {
  return (
    <span className="fb-dots">
      {pattern.split("").map((c, i) => (
        <span key={i} className={`fb-dot fb-dot-${c}`} />
      ))}
    </span>
  );
}

function ChipCloud({ words, total }: { words: string[]; total: number }) {
  const remainder = Math.max(0, total - words.length);
  return (
    <span className="chip-cloud">
      {words.map((word) => (
        <code key={word} className="chip">
          {word}
        </code>
      ))}
      {remainder > 0 && (
        <span className="chip-remainder">
          + {remainder.toLocaleString()} more
        </span>
      )}
    </span>
  );
}

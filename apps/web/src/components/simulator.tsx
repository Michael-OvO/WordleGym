"use client";

// Multi-strategy game simulator.
//
// Step through a single hidden-answer game one turn at a time. At each
// turn, every strategy's top-K ranked candidate guesses are shown side
// by side, so you can see which guess each policy would have picked,
// which one it actually did pick, and how the score gap looked.
//
// The component is deliberately framework-light: a single client
// component with React state for `turn` and `selectedStrategyId`.
// Everything else is pure presentational.

import { useEffect, useMemo, useState } from "react";

import type {
  SimulatorCase,
  SimulatorPayload,
  SimulatorRankedGuess,
  SimulatorStrategy,
} from "@/types/generated";

// ── Tile rendering ───────────────────────────────────────────────────
type TileState = "G" | "Y" | "B" | "";

function tileClass(s: TileState): string {
  if (s === "G") return "sim-tile sim-tile-G";
  if (s === "Y") return "sim-tile sim-tile-Y";
  if (s === "B") return "sim-tile sim-tile-B";
  return "sim-tile sim-tile-empty";
}

function TileRow({ guess, pattern }: { guess: string; pattern: string }) {
  const letters = guess.padEnd(5, " ").slice(0, 5).toUpperCase().split("");
  const states = pattern.padEnd(5, "").slice(0, 5).split("") as TileState[];
  return (
    <div className="sim-row">
      {letters.map((letter, i) => (
        <div key={i} className={tileClass(states[i] ?? "")}>
          <span>{letter.trim()}</span>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────
function tierClass(tier: string): string {
  return `sim-tier sim-tier-${tier}`;
}

// Format a metric score given the strategy's metric metadata.
function formatScore(value: number, metric: SimulatorStrategy["metric"]): string {
  const txt = value.toFixed(metric.decimals ?? 0);
  return metric.unit ? `${txt} ${metric.unit}` : txt;
}

// Per-strategy panel: tile board (revealed up to current turn) + the top-K
// ranking at the *current* turn. If the strategy already finished by this
// turn, the ranking is replaced by a "solved" badge.
function StrategyBallot({
  strategy,
  turn,
  highlight,
  onSelect,
  isSelected,
}: {
  strategy: SimulatorStrategy;
  turn: number;
  highlight: boolean;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const visibleSteps = strategy.turns.filter((t) => t.turn <= turn);
  const currentStep = strategy.turns.find((t) => t.turn === turn);
  const finishedTurnsAgo = strategy.total_turns < turn;
  const isFinishingTurn = strategy.total_turns === turn;

  return (
    <article
      className={
        "sim-ballot" +
        (isSelected ? " sim-ballot-selected" : "") +
        (highlight ? " sim-ballot-highlight" : "")
      }
      onClick={onSelect}
    >
      <header className="sim-ballot-head">
        <div className="sim-ballot-titlerow">
          <code className="sim-ballot-id">{strategy.strategy_id}</code>
          <span className={tierClass(strategy.tier)}>{strategy.tier}</span>
        </div>
        <div className="sim-ballot-meta">
          <span>{strategy.total_turns} turn{strategy.total_turns === 1 ? "" : "s"}</span>
          {currentStep && (
            <>
              <span className="sim-ballot-meta-sep" aria-hidden="true">·</span>
              <span>
                {currentStep.candidates_before.toLocaleString()} →{" "}
                {currentStep.candidates_after.toLocaleString()}
              </span>
            </>
          )}
        </div>
      </header>

      {/* Tile board - revealed turns up to current */}
      <div className="sim-ballot-board">
        {Array.from({ length: Math.max(strategy.total_turns, 5) }).map((_, ri) => {
          const step = visibleSteps[ri];
          if (!step) {
            return <TileRow key={ri} guess="     " pattern="     " />;
          }
          return (
            <TileRow key={ri} guess={step.chosen} pattern={step.chosen_pattern} />
          );
        })}
      </div>

      {/* Ranking panel - what the strategy considered at the current turn */}
      <div className="sim-ballot-rankings">
        {finishedTurnsAgo ? (
          <div className="sim-ballot-finished">
            <span className="sim-ballot-finished-tag">solved on turn {strategy.total_turns}</span>
          </div>
        ) : currentStep ? (
          <>
            <header className="sim-rank-head">
              <span className="sim-rank-head-label">
                top {currentStep.top_candidates.length} ranked by{" "}
                <strong>{strategy.metric.label}</strong>{" "}
                {strategy.metric.goal === "min" ? "↓" : "↑"}
              </span>
              {isFinishingTurn && currentStep.candidates_after === 1 && (
                <span className="sim-rank-flag">solving move</span>
              )}
            </header>
            <ol className="sim-rank-list">
              {currentStep.top_candidates.slice(0, 6).map((c) => (
                <RankedRow key={`${c.guess}-${c.rank}`} cand={c} metric={strategy.metric} />
              ))}
            </ol>
          </>
        ) : (
          <div className="sim-ballot-empty">turn {turn} not yet played</div>
        )}
      </div>
    </article>
  );
}

function RankedRow({ cand, metric }: { cand: SimulatorRankedGuess; metric: SimulatorStrategy["metric"] }) {
  return (
    <li className={"sim-rank-row" + (cand.is_chosen ? " sim-rank-row-chosen" : "")}>
      <span className="sim-rank-num">#{cand.rank}</span>
      <code className="sim-rank-guess">
        {cand.guess.toUpperCase()}
        {cand.is_in_pool && <span className="sim-rank-poolflag" title="in candidate pool">●</span>}
      </code>
      <span className="sim-rank-score">{formatScore(cand.score, metric)}</span>
      {cand.is_chosen && <span className="sim-rank-chosen">★</span>}
    </li>
  );
}

// ── Aggregate panels ─────────────────────────────────────────────────
function AgreementBanner({ caseData, turn }: { caseData: SimulatorCase; turn: number }) {
  const a = caseData.aggregate.agreement_by_turn.find((x) => x.turn === turn);
  if (!a) return null;
  return (
    <div className="sim-agreement">
      <div className="sim-agreement-head">
        <span className="sim-agreement-eyebrow">Turn {turn} agreement</span>
        <span className="sim-agreement-stat">
          <strong>{a.distinct_guesses}</strong> distinct guess{a.distinct_guesses === 1 ? "" : "es"}
          {" "}across the strategies still playing
        </span>
      </div>
      <ul className="sim-agreement-groups">
        {a.guess_groups.map((g) => (
          <li key={g.guess} className="sim-agreement-group">
            <code className="sim-agreement-guess">{g.guess.toUpperCase()}</code>
            <span className="sim-agreement-count">
              ×{g.count} {g.count === 1 ? "" : "(unanimous within cluster)"}
            </span>
            <span className="sim-agreement-list">
              {g.strategies.map((s, i) => (
                <code key={s} className="sim-agreement-strat">
                  {s}
                  {i < g.strategies.length - 1 ? ", " : ""}
                </code>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PoolDecayChart({ caseData }: { caseData: SimulatorCase }) {
  const { pool_decay } = caseData.aggregate;
  const maxPool = caseData.total_candidates;
  // Each strategy gets a thin colored line; pool size on log scale.
  const strategies = caseData.strategies.map((s) => s.strategy_id);
  // Build per-strategy series of (turn, candidates_after) — start at turn 0
  // with the full pool, then apply each turn's reduction.
  const series = strategies.map((sid) => {
    const points: { turn: number; pool: number }[] = [{ turn: 0, pool: maxPool }];
    pool_decay.forEach((p) => {
      const row = p.rows.find((r) => r.strategy_id === sid);
      if (row) {
        points.push({ turn: p.turn, pool: row.candidates_after });
      }
    });
    return { sid, points };
  });

  const maxTurn = Math.max(...pool_decay.map((p) => p.turn));
  const W = 320;
  const H = 130;
  const pad = { top: 8, right: 8, bottom: 22, left: 36 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const xOf = (t: number) => pad.left + (t / maxTurn) * innerW;
  // Log scale (pool 1..maxPool → 0..innerH inverted)
  const logMax = Math.log10(maxPool);
  const yOf = (pool: number) =>
    pad.top + innerH - (Math.log10(Math.max(1, pool)) / logMax) * innerH;

  return (
    <div className="sim-decay">
      <header className="sim-decay-head">
        <span className="sim-decay-eyebrow">Pool decay (log scale)</span>
      </header>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Candidate pool size by turn">
        {/* Y axis ticks: 1, 10, 100, 1000 */}
        {[1, 10, 100, 1000].filter((v) => v <= maxPool).map((v) => (
          <g key={v}>
            <line
              x1={pad.left}
              y1={yOf(v)}
              x2={W - pad.right}
              y2={yOf(v)}
              stroke="rgba(17,24,39,0.06)"
              strokeWidth="1"
            />
            <text x={pad.left - 6} y={yOf(v) + 3} textAnchor="end" className="sim-decay-tick">
              {v}
            </text>
          </g>
        ))}
        {/* X axis ticks: turn numbers */}
        {Array.from({ length: maxTurn + 1 }).map((_, i) => (
          <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle" className="sim-decay-tick">
            t={i}
          </text>
        ))}
        {/* Strategy lines */}
        {series.map((s, idx) => {
          const d = s.points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.turn).toFixed(1)} ${yOf(p.pool).toFixed(1)}`)
            .join(" ");
          return (
            <g key={s.sid}>
              <path
                d={d}
                fill="none"
                stroke={`hsl(${(idx * 36) % 360}, 60%, 45%)`}
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.85"
              />
            </g>
          );
        })}
      </svg>
      <div className="sim-decay-legend">
        {series.map((s, idx) => (
          <span key={s.sid} className="sim-decay-legend-item">
            <span
              className="sim-decay-legend-swatch"
              style={{ background: `hsl(${(idx * 36) % 360}, 60%, 45%)` }}
            />
            <code>{s.sid}</code>
          </span>
        ))}
      </div>
    </div>
  );
}

function DepthDistribution({ caseData }: { caseData: SimulatorCase }) {
  const { solve_depth_distribution, mean_solve_depth } = caseData.aggregate;
  const max = Math.max(...solve_depth_distribution.map((d) => d.count));
  return (
    <div className="sim-depth">
      <header className="sim-depth-head">
        <span className="sim-depth-eyebrow">Solve depth distribution</span>
        <span className="sim-depth-mean">mean {mean_solve_depth.toFixed(2)}</span>
      </header>
      <div className="sim-depth-bars">
        {solve_depth_distribution.map((d) => (
          <div key={d.depth} className="sim-depth-bar">
            <span className="sim-depth-label">{d.depth} turn{d.depth === 1 ? "" : "s"}</span>
            <div className="sim-depth-track">
              <div
                className="sim-depth-fill"
                style={{ width: `${(d.count / max) * 100}%` }}
              />
              <span className="sim-depth-count">{d.count}</span>
            </div>
            <span className="sim-depth-strats">
              {d.strategies.map((s) => (
                <code key={s}>{s}</code>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────
export function Simulator({ payload }: { payload: SimulatorPayload }) {
  const [caseIdx, setCaseIdx] = useState(0);
  const caseData = payload.cases[caseIdx];
  const maxTurn = caseData?.aggregate.max_solve_depth ?? 0;
  const [turn, setTurn] = useState(1);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [autoplay, setAutoplay] = useState(false);

  // Reset turn when case changes
  useEffect(() => {
    setTurn(1);
    setSelectedStrategyId(null);
    setAutoplay(false);
  }, [caseIdx]);

  // Autoplay
  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => {
      setTurn((t) => {
        if (t >= maxTurn) {
          setAutoplay(false);
          return t;
        }
        return t + 1;
      });
    }, 1800);
    return () => window.clearInterval(id);
  }, [autoplay, maxTurn]);

  const selectedStrategy = useMemo(
    () => caseData?.strategies.find((s) => s.strategy_id === selectedStrategyId) ?? null,
    [caseData, selectedStrategyId],
  );

  if (!caseData) {
    return null;
  }

  return (
    <section className="simulator">
      <div className="section-header">
        <p className="eyebrow">Simulator</p>
        <h2>Step through every algorithm at once</h2>
        <p>
          Pick a turn — every strategy reveals its candidate pool, the top
          ranked guesses under <em>its own</em> objective, and the move it
          actually committed to. The trajectories play forward from turn 1
          to the last solve.
        </p>
      </div>

      {/* ── Case selector ── */}
      {payload.cases.length > 1 && (
        <div className="sim-cases">
          {payload.cases.map((c, i) => (
            <button
              key={c.case_id}
              type="button"
              className={"sim-case-btn" + (i === caseIdx ? " is-active" : "")}
              onClick={() => setCaseIdx(i)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Case header ── */}
      <header className="sim-case-head">
        <div>
          <h3 className="sim-case-label">{caseData.label}</h3>
          <p className="sim-case-desc">{caseData.description}</p>
        </div>
        <dl className="sim-case-stats">
          <div>
            <dt>answer</dt>
            <dd><code>{caseData.hidden_answer.toUpperCase()}</code></dd>
          </div>
          <div>
            <dt>actual mode</dt>
            <dd>{caseData.hidden_mode ?? "—"}</dd>
          </div>
          <div>
            <dt>distinct trajectories</dt>
            <dd>
              <strong>
                {new Set(caseData.strategies.map((s) =>
                  s.turns.map((t) => t.chosen).join("→"),
                )).size}
              </strong>
              {" / "}
              {caseData.strategies.length}
            </dd>
          </div>
          <div>
            <dt>solve depth</dt>
            <dd>
              {caseData.aggregate.min_solve_depth}–{caseData.aggregate.max_solve_depth}
            </dd>
          </div>
        </dl>
      </header>

      {/* ── Turn control ── */}
      <div className="sim-controls">
        <button
          type="button"
          className="sim-ctrl-btn"
          onClick={() => setTurn((t) => Math.max(1, t - 1))}
          disabled={turn <= 1}
          aria-label="previous turn"
        >
          ◀ prev
        </button>
        <div className="sim-ctrl-track">
          {Array.from({ length: maxTurn }).map((_, i) => {
            const t = i + 1;
            return (
              <button
                key={t}
                type="button"
                className={"sim-ctrl-step" + (t === turn ? " is-active" : "") + (t < turn ? " is-past" : "")}
                onClick={() => setTurn(t)}
                aria-label={`go to turn ${t}`}
              >
                <span className="sim-ctrl-step-label">turn {t}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="sim-ctrl-btn"
          onClick={() => setTurn((t) => Math.min(maxTurn, t + 1))}
          disabled={turn >= maxTurn}
          aria-label="next turn"
        >
          next ▶
        </button>
        <button
          type="button"
          className={"sim-ctrl-btn sim-ctrl-play" + (autoplay ? " is-playing" : "")}
          onClick={() => {
            if (turn >= maxTurn) setTurn(1);
            setAutoplay((p) => !p);
          }}
          aria-label={autoplay ? "pause" : "play"}
        >
          {autoplay ? "❚❚ pause" : "▶ play"}
        </button>
      </div>

      {/* ── Agreement banner for current turn ── */}
      <AgreementBanner caseData={caseData} turn={turn} />

      {/* ── Strategy ballots grid ── */}
      <div className="sim-grid">
        {caseData.strategies.map((s) => (
          <StrategyBallot
            key={s.strategy_id}
            strategy={s}
            turn={turn}
            highlight={
              selectedStrategy != null &&
              s.turns.find((t) => t.turn === turn)?.chosen ===
                selectedStrategy.turns.find((t) => t.turn === turn)?.chosen
            }
            onSelect={() =>
              setSelectedStrategyId((cur) => (cur === s.strategy_id ? null : s.strategy_id))
            }
            isSelected={selectedStrategyId === s.strategy_id}
          />
        ))}
      </div>

      {/* ── Aggregate stats below the grid ── */}
      <div className="sim-aggregate">
        <DepthDistribution caseData={caseData} />
        <PoolDecayChart caseData={caseData} />
      </div>
    </section>
  );
}

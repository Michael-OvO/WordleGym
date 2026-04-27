"use client";

import { startTransition, useEffect, useMemo, useState, useTransition } from "react";

import {
  applyGuessToState,
  chooseStrategyGuess,
  computeStrategyInsight,
  createGameState,
  loadWordLists,
  type GameState,
  type Mode,
  type StrategyInsight,
  type WordLists,
} from "@/lib/game-core";

const STRATEGIES = [
  "random-valid",
  "letter-frequency",
  "candidate-elimination",
  "expected-entropy",
  "minimax",
  "posterior-hybrid",
  "evil-shortest-path",
  "posterior-expectimax",
  "robust-scalarization",
  "evil-dp",
] as const;

const MAX_TURNS = 6;
const WORD_LENGTH = 5;

type Props = {
  mode: Mode;
};

export function PlayLab({ mode }: Props) {
  const [wordLists, setWordLists] = useState<WordLists | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [guess, setGuess] = useState("");
  const [strategyId, setStrategyId] = useState<(typeof STRATEGIES)[number]>("expected-entropy");
  const [priorEvil, setPriorEvil] = useState(0.5);
  const [message, setMessage] = useState<string | null>(null);
  const [insight, setInsight] = useState<StrategyInsight | null>(null);
  const [insightPending, setInsightPending] = useState(false);
  const [isPending, startPendingTransition] = useTransition();

  useEffect(() => {
    let mounted = true;
    loadWordLists()
      .then((lists) => {
        if (!mounted) return;
        setWordLists(lists);
        setGame(createGameState(mode, lists, { priorEvil }));
      })
      .catch((error) => {
        if (mounted) setMessage(error instanceof Error ? error.message : "Failed to load word lists.");
      });
    return () => {
      mounted = false;
    };
  }, [mode, priorEvil]);

  const canPlay = Boolean(wordLists && game && !game.solved && !game.exhausted);

  useEffect(() => {
    if (!game || game.solved || game.exhausted) {
      setInsight(null);
      setInsightPending(false);
      return;
    }
    setInsightPending(true);
    let cancelled = false;
    const handle = window.setTimeout(() => {
      if (cancelled) return;
      const result = computeStrategyInsight(game, strategyId, 6);
      if (!cancelled) {
        setInsight(result);
        setInsightPending(false);
      }
    }, 40);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [game, strategyId]);
  const candidateLabel = useMemo(() => {
    if (!game) return "";
    if (mode === "unknown") {
      return `${game.standardCandidateWords.length} std / ${game.evilCandidateWords.length} evil`;
    }
    return `${game.candidateWords.length} feasible`;
  }, [game, mode]);

  const resetGame = () => {
    if (!wordLists) return;
    setGame(createGameState(mode, wordLists, { priorEvil }));
    setGuess("");
    setMessage(null);
  };

  const submitGuess = (nextGuess: string, explanation?: Record<string, unknown>) => {
    if (!game) return;
    try {
      const updated = applyGuessToState(game, nextGuess, explanation);
      setGame(updated);
      setGuess("");
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not apply guess.");
    }
  };

  const handleManualSubmit = () => {
    submitGuess(guess);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canPlay && guess.length === WORD_LENGTH) {
      handleManualSubmit();
    }
  };

  const takeSolverStep = () => {
    if (!game) return;
    startPendingTransition(() => {
      const decision = chooseStrategyGuess(game, strategyId);
      submitGuess(decision.guess, decision.explanation);
    });
  };

  const autoplay = () => {
    if (!game) return;
    const run = (current: GameState) => {
      if (current.solved || current.exhausted) return;
      const decision = chooseStrategyGuess(current, strategyId);
      const updated = applyGuessToState(current, decision.guess, decision.explanation);
      startTransition(() => setGame(updated));
      window.setTimeout(() => run(updated), 180);
    };
    run(game);
  };

  const turnsUsed = game?.steps.length ?? 0;
  const boardStatus = game?.solved ? "solved" : isPending ? "thinking" : game?.exhausted ? "failed" : undefined;

  return (
    <section className="play-shell" data-mode={mode}>
      <aside className="play-sidebar">
        {mode === "evil" ? (
          <span className="evil-chip" aria-label="Adversary active">
            <span className="evil-chip-dot" />
            Adversary active
          </span>
        ) : null}
        <p className="eyebrow">{mode} mode</p>
        <h2>Interactive Lab</h2>
        <p className="muted-copy">
          {mode === "standard" && "Fixed hidden answer with canonical Wordle feedback."}
          {mode === "evil" && "The host rewrites its answer each turn to keep the bucket largest."}
          {mode === "unknown" && "Infer whether the environment is standard or evil."}
        </p>

        {mode === "unknown" ? (
          <label className="slider-group">
            <span>Evil prior: {priorEvil.toFixed(2)}</span>
            <input
              max={0.9}
              min={0.1}
              onChange={(event) => setPriorEvil(Number(event.target.value))}
              step={0.05}
              type="range"
              value={priorEvil}
            />
          </label>
        ) : null}

        <div className="metric-block">
          <span>Candidates</span>
          <strong>{candidateLabel}</strong>
        </div>

        {game?.mode === "unknown" ? (
          <div className="metric-block">
            <span>Posterior</span>
            <strong>
              S {game.modePosterior.standard.toFixed(2)} / E {game.modePosterior.evil.toFixed(2)}
            </strong>
          </div>
        ) : null}

        <label className="field-group">
          <span>Strategy</span>
          <select className="soft-input" onChange={(event) => setStrategyId(event.target.value as typeof strategyId)} value={strategyId}>
            {STRATEGIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <div className="action-row">
          <button className="primary-button" disabled={!canPlay || isPending} onClick={takeSolverStep} type="button">
            Solver step
          </button>
          <button className="secondary-button" disabled={!canPlay} onClick={autoplay} type="button">
            Autoplay
          </button>
        </div>
        <button className="ghost-button" onClick={resetGame} type="button">
          New game
        </button>

        <InsightPanel
          insight={insight}
          pending={insightPending}
          strategyId={strategyId}
          canPlay={canPlay}
          onPick={(guessWord, explanation) => submitGuess(guessWord, explanation)}
        />
      </aside>

      <div className="play-main">
        <div className="panel play-board-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Board</p>
              <h3>Turn {turnsUsed} of {MAX_TURNS}</h3>
            </div>
            {boardStatus ? (
              <span className="status-badge" data-status={boardStatus}>
                {boardStatus === "solved" ? "Solved" : boardStatus === "thinking" ? "Thinking" : "Exhausted"}
              </span>
            ) : null}
          </div>

          <div className="board-container">
            <div className="guess-form">
              <input
                aria-label="Guess input"
                className="soft-input guess-input"
                maxLength={5}
                onChange={(event) => setGuess(event.target.value.toLowerCase())}
                onKeyDown={handleKeyDown}
                placeholder="type a word"
                value={guess}
              />
              <button className="primary-button" disabled={!canPlay || guess.length !== WORD_LENGTH} onClick={handleManualSubmit} type="button">
                Enter
              </button>
            </div>

            {message ? <p className="error-copy">{message}</p> : null}

            <div className="grid-shell">
              {/* Filled rows from game steps */}
              {game?.steps.map((step) => (
                <div className="grid-row" key={`${step.turn}-${step.guess}`}>
                  {step.guess.split("").map((letter, index) => (
                    <div className={`grid-cell tile-${step.patternText[index]}`} key={`${step.turn}-${letter}-${index}`}>
                      <span>{letter.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              ))}
              {/* Empty placeholder rows */}
              {Array.from({ length: MAX_TURNS - turnsUsed }, (_, rowIndex) => (
                <div className="grid-row" key={`empty-${rowIndex}`}>
                  {Array.from({ length: WORD_LENGTH }, (_, colIndex) => (
                    <div className="grid-cell tile-empty" key={`empty-${rowIndex}-${colIndex}`} />
                  ))}
                </div>
              ))}
            </div>

            {game?.solved ? (
              <p className="board-result board-result-win">
                Solved in {turnsUsed} {turnsUsed === 1 ? "guess" : "guesses"}
              </p>
            ) : game?.exhausted ? (
              <p className="board-result board-result-lose">
                Not solved within {MAX_TURNS} turns
              </p>
            ) : null}
          </div>
        </div>

        <div className="panel play-trace-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Trace</p>
              <h3>Decision log</h3>
            </div>
            {game?.steps.length ? (
              <span className="trace-count" aria-label={`${game.steps.length} entries`}>
                {String(game.steps.length).padStart(2, "0")}
              </span>
            ) : null}
          </div>
          <div className="trace-list" data-has-entries={game?.steps.length ? "true" : "false"}>
            {game?.steps.length === 0 ? (
              <p className="muted-copy trace-empty">
                Make a guess to see the solver trace.
              </p>
            ) : null}
            {game?.steps.map((step) => (
              <article className="trace-step" key={`trace-${step.turn}`}>
                <div className="trace-rail" aria-hidden="true">
                  <span className="trace-rail-dot">{step.turn}</span>
                </div>
                <div className="trace-body">
                  <div className="trace-title">
                    <strong>Turn {step.turn}</strong>
                    <span className="trace-guess">{step.guess.toUpperCase()}</span>
                    <span className="trace-pattern">{step.patternEmoji}</span>
                  </div>
                  <p className="trace-meta">
                    {step.remainingCandidates} candidates left
                    {typeof step.standardCandidates === "number" ? ` · standard ${step.standardCandidates}` : ""}
                    {typeof step.evilCandidates === "number" ? ` · evil ${step.evilCandidates}` : ""}
                  </p>
                  {step.modePosterior ? (
                    <p className="trace-meta">
                      posterior S {step.modePosterior.standard.toFixed(2)} / E {step.modePosterior.evil.toFixed(2)}
                    </p>
                  ) : null}
                  <pre className="trace-code">{JSON.stringify(step.explanation ?? {}, null, 2)}</pre>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type InsightPanelProps = {
  insight: StrategyInsight | null;
  pending: boolean;
  strategyId: string;
  canPlay: boolean;
  onPick: (guess: string, explanation: Record<string, unknown>) => void;
};

function InsightPanel({ insight, pending, strategyId, canPlay, onPick }: InsightPanelProps) {
  return (
    <div className="insight-panel" data-shape={insight?.kind ?? "loading"}>
      <div className="insight-header">
        <span className="eyebrow">{strategyId.replace(/-/g, " ")}</span>
        <span className="insight-meta">
          {insight?.metricLabel ?? ""}
          {insight && "unitLabel" in insight && insight.unitLabel ? ` · ${insight.unitLabel}` : ""}
        </span>
      </div>
      {pending && !insight ? (
        <p className="insight-status">Scoring candidate pool…</p>
      ) : !insight ? (
        <p className="insight-status">No candidates.</p>
      ) : insight.kind === "bars" ? (
        <InsightBars insight={insight} canPlay={canPlay} onPick={onPick} pending={pending} />
      ) : insight.kind === "split" ? (
        <InsightSplitView insight={insight} canPlay={canPlay} onPick={onPick} pending={pending} />
      ) : insight.kind === "heatmap" ? (
        <InsightHeatmap insight={insight} pending={pending} />
      ) : (
        <InsightPills insight={insight} canPlay={canPlay} onPick={onPick} pending={pending} />
      )}
    </div>
  );
}

function InsightBars({
  insight,
  canPlay,
  onPick,
  pending,
}: {
  insight: Extract<StrategyInsight, { kind: "bars" }>;
  canPlay: boolean;
  onPick: InsightPanelProps["onPick"];
  pending: boolean;
}) {
  const maxValue = insight.entries.reduce((m, e) => Math.max(m, e.value), 0);
  const minValue = insight.entries.reduce((m, e) => Math.min(m, e.value), Infinity);
  const span = Math.max(maxValue - minValue, 1e-9);
  return (
    <ul className="insight-bars" aria-busy={pending}>
      {insight.entries.map((entry, index) => {
        const pct = insight.higherIsBetter
          ? maxValue > 0
            ? (entry.value / maxValue) * 100
            : 0
          : maxValue === 0
            ? 0
            : Math.max(12, (1 - (entry.value - minValue) / span) * 100);
        return (
          <li className="insight-row" key={entry.guess}>
            <span className="insight-rank">{index + 1}</span>
            <button
              className="insight-word"
              disabled={!canPlay}
              onClick={() =>
                onPick(entry.guess, {
                  source: "insight-panel",
                  metric: insight.metricLabel,
                  value: entry.value,
                })
              }
              type="button"
            >
              {entry.guess.toUpperCase()}
            </button>
            <div className="insight-bar" aria-hidden="true">
              <span className="insight-bar-fill" style={{ width: `${pct}%` }}>
                <span className="insight-bar-value">{entry.display}</span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function InsightSplitView({
  insight,
  canPlay,
  onPick,
  pending,
}: {
  insight: Extract<StrategyInsight, { kind: "split" }>;
  canPlay: boolean;
  onPick: InsightPanelProps["onPick"];
  pending: boolean;
}) {
  const maxTotal = insight.entries.reduce((m, e) => Math.max(m, e.total), 0) || 1;
  const standardPct = (insight.standardWeight * 100).toFixed(0);
  const evilPct = (insight.evilWeight * 100).toFixed(0);
  return (
    <div className="insight-split" aria-busy={pending}>
      <div className="insight-legend">
        <span className="insight-legend-item" data-variant="standard">
          <span className="insight-legend-swatch" /> {insight.standardLabel} · {standardPct}%
        </span>
        <span className="insight-legend-item" data-variant="evil">
          <span className="insight-legend-swatch" /> {insight.evilLabel} · {evilPct}%
        </span>
      </div>
      <ul className="insight-bars">
        {insight.entries.map((entry, index) => {
          const stdPct = (entry.standardPart / maxTotal) * 100;
          const evPct = (entry.evilPart / maxTotal) * 100;
          return (
            <li className="insight-row" key={entry.guess}>
              <span className="insight-rank">{index + 1}</span>
              <button
                className="insight-word"
                disabled={!canPlay}
                onClick={() =>
                  onPick(entry.guess, {
                    source: "insight-panel",
                    metric: insight.metricLabel,
                    standardPart: entry.standardPart,
                    evilPart: entry.evilPart,
                    total: entry.total,
                  })
                }
                type="button"
              >
                {entry.guess.toUpperCase()}
              </button>
              <div className="insight-bar insight-bar-split" aria-hidden="true">
                <span className="insight-bar-fill insight-split-standard" style={{ width: `${stdPct}%` }} />
                <span className="insight-bar-fill insight-split-evil" style={{ width: `${evPct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function InsightHeatmap({
  insight,
  pending,
}: {
  insight: Extract<StrategyInsight, { kind: "heatmap" }>;
  pending: boolean;
}) {
  return (
    <div className="insight-heatmap" aria-busy={pending}>
      {insight.columns.map((column, position) => (
        <div className="insight-heatmap-col" key={position}>
          <span className="insight-heatmap-pos">{position + 1}</span>
          {column.map((cell) => (
            <span
              className="insight-heatmap-cell"
              key={`${position}-${cell.letter}`}
              style={{ opacity: 0.25 + cell.weight * 0.75 }}
              title={`${(cell.weight * 100).toFixed(0)}%`}
            >
              <span className="insight-heatmap-letter">{cell.letter.toUpperCase()}</span>
              <span className="insight-heatmap-weight">{(cell.weight * 100).toFixed(0)}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function InsightPills({
  insight,
  canPlay,
  onPick,
  pending,
}: {
  insight: Extract<StrategyInsight, { kind: "pills" }>;
  canPlay: boolean;
  onPick: InsightPanelProps["onPick"];
  pending: boolean;
}) {
  return (
    <div className="insight-pills" aria-busy={pending}>
      <p className="insight-pills-note">{insight.poolSize} candidates · uniform sample</p>
      <div className="insight-pills-row">
        {insight.entries.map((word) => (
          <button
            className="insight-pill"
            disabled={!canPlay}
            key={word}
            onClick={() => onPick(word, { source: "insight-panel", metric: "uniform sample", poolSize: insight.poolSize })}
            type="button"
          >
            {word.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

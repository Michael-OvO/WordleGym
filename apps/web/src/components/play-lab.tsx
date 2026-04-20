"use client";

import { startTransition, useEffect, useMemo, useState, useTransition } from "react";

import {
  applyGuessToState,
  chooseStrategyGuess,
  createGameState,
  loadWordLists,
  type GameState,
  type Mode,
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
    <section className="play-shell">
      <aside className="play-sidebar">
        <p className="eyebrow">{mode} mode</p>
        <h2>Interactive Lab</h2>
        <p className="muted-copy">
          {mode === "standard" && "Fixed hidden answer with canonical Wordle feedback."}
          {mode === "evil" && "Adversarial — preserves the largest feasible answer set."}
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
      </aside>

      <div className="play-main">
        <div className="panel">
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

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Trace</p>
              <h3>Decision log</h3>
            </div>
          </div>
          <div className="trace-list">
            {game?.steps.length === 0 ? (
              <p className="muted-copy">Make a guess to see the solver trace.</p>
            ) : null}
            {game?.steps.map((step) => (
              <article className="trace-step" key={`trace-${step.turn}`}>
                <div className="trace-title">
                  <strong>Turn {step.turn}</strong>
                  <span>{step.guess.toUpperCase()}</span>
                  <span>{step.patternEmoji}</span>
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
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

import type { ReplayTrace } from "@/types/generated";

type Props = {
  trace: ReplayTrace;
};

export function ReplayPanel({ trace }: Props) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Replay — {trace.branch}</p>
          <h2>{trace.strategy_id}</h2>
        </div>
        <div className="metric-stack">
          <span>{trace.turns} {trace.turns === 1 ? "turn" : "turns"}</span>
          <span className="status-badge" data-status={trace.solved ? "solved" : "failed"}>
            {trace.solved ? "Solved" : "Unresolved"}
          </span>
        </div>
      </div>

      <div className="trace-list">
        {trace.steps.map((step) => (
          <article className="trace-step" key={step.turn}>
            <div className="trace-title">
              <strong>Turn {step.turn}</strong>
              <span>{step.guess.toUpperCase()}</span>
              <span>{step.pattern_emoji}</span>
            </div>
            <p className="trace-meta">{step.remaining_candidates} candidates remain</p>
            <pre className="trace-code">{JSON.stringify(step.explanation, null, 2)}</pre>
          </article>
        ))}
      </div>
    </section>
  );
}

"use client";

import { useDeferredValue, useMemo, useState } from "react";

import type { DecisionSnapshot, RobustnessPayload, SampleReplayPayload, SummariesPayload } from "@/types/generated";

type Props = {
  summaries: SummariesPayload;
  robustness: RobustnessPayload;
  decisions: DecisionSnapshot[];
  replays: SampleReplayPayload;
};

const modeLabels = {
  standard: "Standard",
  evil: "Evil",
  unknown: "Unknown",
} as const;

export function ResultsExplorer({ summaries, robustness, decisions, replays }: Props) {
  const [mode, setMode] = useState<keyof SummariesPayload>("standard");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const filteredRows = useMemo(() => {
    const rows = summaries[mode] ?? [];
    const normalized = deferredQuery.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter(
      (row) =>
        row.label.toLowerCase().includes(normalized) || row.strategy_id.toLowerCase().includes(normalized),
    );
  }, [deferredQuery, mode, summaries]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Benchmark Explorer</p>
          <h2>Strategy performance by environment</h2>
        </div>
        <input
          aria-label="Filter strategies"
          className="soft-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter strategies"
          value={query}
        />
      </div>

      <div className="pill-row" role="tablist">
        {(Object.keys(modeLabels) as Array<keyof SummariesPayload>).map((item) => (
          <button
            aria-selected={item === mode}
            className={item === mode ? "pill pill-active" : "pill"}
            key={item}
            onClick={() => setMode(item)}
            role="tab"
            type="button"
          >
            {modeLabels[item]}
          </button>
        ))}
      </div>

      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Average</th>
              <th>Worst Case</th>
              <th>Solve Rate</th>
              <th>Penalized</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.strategy_id}>
                <td>
                  <strong>{row.label}</strong>
                  <div className="table-subtle">{row.objective}</div>
                </td>
                <td>{row.average_guesses.toFixed(3)}</td>
                <td>{row.worst_case}</td>
                <td>{(row.solve_rate * 100).toFixed(1)}%</td>
                <td>{row.penalized_average_guesses.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="results-grid">
        <article className="subpanel">
          <p className="eyebrow">Robustness</p>
          <h3>Mismatch spread</h3>
          <ul className="compact-list">
            {robustness.mismatch_spread.slice(0, 6).map((row) => (
              <li key={row.strategy_id}>
                <span>{row.strategy_id}</span>
                <strong>{row.spread.toFixed(3)}</strong>
              </li>
            ))}
          </ul>
        </article>

        <article className="subpanel">
          <p className="eyebrow">Decision Tree Snapshots</p>
          <h3>Opening partitions</h3>
          <ul className="snapshot-list">
            {decisions.map((snapshot) => (
              <li key={`${snapshot.mode}-${snapshot.strategy_id}`}>
                <div>
                  <strong>{snapshot.strategy_id}</strong>
                  <p>{snapshot.first_guess.toUpperCase()}</p>
                </div>
                <span>{snapshot.top_partitions[0]?.size ?? 0} largest bucket</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="subpanel">
          <p className="eyebrow">Replay Coverage</p>
          <h3>Saved showcase traces</h3>
          <ul className="compact-list">
            {Object.entries(replays).map(([replayMode, strategies]) => (
              <li key={replayMode}>
                <span>{replayMode}</span>
                <strong>{Object.keys(strategies ?? {}).length}</strong>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

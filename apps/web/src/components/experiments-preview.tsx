"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { SampleReplayPayload, SummariesPayload } from "@/types/generated";
import {
  STRATEGY_COLORS,
  STRATEGY_LABELS,
  buildCandidateDecayData,
  buildInformationGainData,
  buildPosteriorData,
  buildWorstVsAvgData,
} from "@/lib/chart-data";

type Props = {
  summaries: SummariesPayload;
  replays: SampleReplayPayload;
};

const CHART_MARGIN = { top: 4, right: 12, bottom: 4, left: 0 };
const AXIS_STYLE = { fontSize: 11, fill: "var(--text-secondary)" };
const GRID_STROKE = "var(--surface-rule)";

function ClientChart({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return <div className="chart-container">{mounted ? children : null}</div>;
}

function ChartTooltipContent({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--tile-border)", borderRadius: 8, padding: "10px 14px", fontSize: 12, boxShadow: "var(--shadow-md)" }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>Turn {label}</div>
      {payload.map((entry) => (
        <div key={entry.name} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: entry.color, flexShrink: 0 }} />
          <span style={{ color: "var(--text-secondary)" }}>{STRATEGY_LABELS[entry.name] ?? entry.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600, color: "var(--text)" }}>{typeof entry.value === "number" ? entry.value.toFixed(2) : entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function CandidateDecayChart({ replays }: { replays: SampleReplayPayload }) {
  const data = buildCandidateDecayData(replays);
  const strategyIds = Object.keys(replays.standard ?? {});

  return (
    <div className="chart-panel">
      <h3>Candidate Pool Decay</h3>
      <p>How each strategy reduces the search space over turns</p>
      <ClientChart>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="turn" tick={AXIS_STYLE} label={{ value: "Turn", position: "bottom", style: { fontSize: 10, fill: "var(--neutral)" } }} />
            <YAxis tick={AXIS_STYLE} />
            <Tooltip content={<ChartTooltipContent />} />
            {strategyIds.map((id) => (
              <Line
                key={id}
                type="monotone"
                dataKey={id}
                stroke={STRATEGY_COLORS[id] ?? "#94a3b8"}
                strokeWidth={2}
                dot={false}
                name={id}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ClientChart>
    </div>
  );
}

function InformationGainChart({ replays }: { replays: SampleReplayPayload }) {
  const data = buildInformationGainData(replays);
  const strategyIds = Object.keys(replays.standard ?? {});

  return (
    <div className="chart-panel">
      <h3>Information Gain per Turn</h3>
      <p>Bits of information extracted at each guess (log₂ reduction)</p>
      <ClientChart>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="turn" tick={AXIS_STYLE} />
            <YAxis tick={AXIS_STYLE} label={{ value: "bits", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "var(--neutral)" } }} />
            <Tooltip content={<ChartTooltipContent />} />
            {strategyIds.map((id) => (
              <Line
                key={id}
                type="monotone"
                dataKey={id}
                stroke={STRATEGY_COLORS[id] ?? "#94a3b8"}
                strokeWidth={2}
                dot={{ r: 3, fill: STRATEGY_COLORS[id] ?? "#94a3b8" }}
                name={id}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ClientChart>
    </div>
  );
}

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { label: string; avg: number; worst: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--tile-border)", borderRadius: 8, padding: "10px 14px", fontSize: 12, boxShadow: "var(--shadow-md)" }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>{d.label}</div>
      <div style={{ color: "var(--text-secondary)" }}>Avg: {d.avg.toFixed(3)}</div>
      <div style={{ color: "var(--text-secondary)" }}>Worst: {d.worst}</div>
    </div>
  );
}

function WorstVsAvgChart({ summaries }: { summaries: SummariesPayload }) {
  const data = buildWorstVsAvgData(summaries.standard ?? []);

  return (
    <div className="chart-panel">
      <h3>Worst-Case vs Average</h3>
      <p>Trade-off between average guesses and worst-case performance</p>
      <ClientChart>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ ...CHART_MARGIN, bottom: 16, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis type="number" dataKey="avg" name="Avg Guesses" tick={AXIS_STYLE} label={{ value: "Avg guesses", position: "bottom", style: { fontSize: 10, fill: "var(--neutral)" } }} domain={["auto", "auto"]} />
            <YAxis type="number" dataKey="worst" name="Worst Case" tick={AXIS_STYLE} label={{ value: "Worst case", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "var(--neutral)" } }} />
            <Tooltip content={<ScatterTooltip />} />
            {data.map((point) => (
              <Scatter key={point.strategy} data={[point]} fill={point.color} name={point.label} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </ClientChart>
    </div>
  );
}

function PosteriorEvolutionChart({ summaries }: { summaries: SummariesPayload }) {
  const data = buildPosteriorData(summaries);
  const strategyIds = (summaries.unknown ?? []).map((r) => r.strategy_id);

  if (data.length === 0) {
    return (
      <div className="chart-panel">
        <h3>Posterior Evolution</h3>
        <p>Mode inference accuracy over turns (Unknown mode)</p>
        <div className="chart-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: 13 }}>
          No posterior data available
        </div>
      </div>
    );
  }

  return (
    <div className="chart-panel">
      <h3>Posterior Evolution</h3>
      <p>Mode inference accuracy over turns (Unknown mode)</p>
      <ClientChart>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="turn" tick={AXIS_STYLE} />
            <YAxis tick={AXIS_STYLE} domain={[0, 1]} label={{ value: "P(true mode)", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "var(--neutral)" } }} />
            <Tooltip content={<ChartTooltipContent />} />
            {strategyIds.map((id) => (
              <Line
                key={id}
                type="monotone"
                dataKey={id}
                stroke={STRATEGY_COLORS[id] ?? "#94a3b8"}
                strokeWidth={2}
                dot={{ r: 3, fill: STRATEGY_COLORS[id] ?? "#94a3b8" }}
                name={id}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ClientChart>
    </div>
  );
}

export function ExperimentsPreview({ summaries, replays }: Props) {
  return (
    <section>
      <div className="section-header">
        <p className="eyebrow">Experiments</p>
        <h2>Behavioral profiles</h2>
        <p>How each strategy approaches uncertainty — candidate elimination speed, information extraction, risk tolerance, and mode inference.</p>
      </div>
      <div className="chart-grid">
        <CandidateDecayChart replays={replays} />
        <InformationGainChart replays={replays} />
        <WorstVsAvgChart summaries={summaries} />
        <PosteriorEvolutionChart summaries={summaries} />
      </div>
      <div className="chart-legend">
        {Object.entries(STRATEGY_COLORS).map(([id, color]) => (
          <div key={id} className="chart-legend-item">
            <span className="chart-legend-swatch" style={{ background: color }} />
            <span>{STRATEGY_LABELS[id] ?? id}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

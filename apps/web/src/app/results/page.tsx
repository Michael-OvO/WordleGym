import { ResultsExplorer } from "@/components/results-explorer";
import { getDecisionSnapshots, getRobustness, getSampleReplays, getSummaries } from "@/lib/generated-data";

export default async function ResultsPage() {
  const [summaries, robustness, decisions, replays] = await Promise.all([
    getSummaries(),
    getRobustness(),
    getDecisionSnapshots(),
    getSampleReplays(),
  ]);

  return (
    <main className="page-shell page-tight">
      <header className="page-header-panel">
        <p className="eyebrow">Results</p>
        <h1>Static benchmark artifacts</h1>
        <p className="muted-copy">
          The app reads precomputed summaries, mismatch tables, and sample replays from the generated artifact set. No runtime database or Python API is required.
        </p>
      </header>
      <ResultsExplorer decisions={decisions} replays={replays} robustness={robustness} summaries={summaries} />
    </main>
  );
}


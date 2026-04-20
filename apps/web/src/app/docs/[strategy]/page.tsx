import { notFound } from "next/navigation";
import Link from "next/link";

import { STRATEGY_CONTENT, STRATEGY_IDS } from "@/lib/strategy-content";
import { MathBlock } from "./math";

export function generateStaticParams() {
  return STRATEGY_IDS.map((id) => ({ strategy: id }));
}

type Props = {
  params: Promise<{ strategy: string }>;
};

export default async function StrategyDocPage({ params }: Props) {
  const { strategy } = await params;
  const content = STRATEGY_CONTENT[strategy];

  if (!content) {
    notFound();
  }

  const currentIndex = STRATEGY_IDS.indexOf(strategy);
  const prevId = currentIndex > 0 ? STRATEGY_IDS[currentIndex - 1] : null;
  const nextId = currentIndex < STRATEGY_IDS.length - 1 ? STRATEGY_IDS[currentIndex + 1] : null;

  return (
    <main className="page-shell page-tight">
      <article className="doc-prose">
        <nav className="doc-nav">
          <Link href="/docs">All strategies</Link>
          {prevId && <Link href={`/docs/${prevId}`}>{STRATEGY_CONTENT[prevId].title}</Link>}
          {nextId && <Link href={`/docs/${nextId}`}>{STRATEGY_CONTENT[nextId].title}</Link>}
        </nav>

        <p className="eyebrow">Strategy</p>
        <div className="doc-title-row">
          <h1>{content.title}</h1>
          <span className={`tier-badge tier-${content.tier}`}>{content.tierLabel}</span>
        </div>
        <p className="doc-subtitle">{content.subtitle}</p>

        <dl className="doc-summary">
          <div>
            <dt>Local objective</dt>
            <dd>{content.localObjective}</dd>
          </div>
          <div>
            <dt>Caveat</dt>
            <dd>{content.caveat}</dd>
          </div>
        </dl>

        {/* Overview */}
        <h2>Overview</h2>
        {content.overview.map((para, i) => (
          <p key={i}>{para}</p>
        ))}

        {/* How It Works */}
        <h2>How It Works</h2>
        {content.howItWorks.map((para, i) => (
          <p key={i}>{para}</p>
        ))}

        {/* Mathematical Formulation */}
        <h2>Mathematical Formulation</h2>
        <p>
          The core mathematics behind {content.title}. Each formula is annotated with
          its role in the decision-making process.
        </p>
        {content.mathFormulas.map((formula, i) => (
          <div key={i} className="formula-block">
            <h3>{formula.label}</h3>
            <MathBlock formula={formula.display} />
            <p>{formula.explanation}</p>
          </div>
        ))}

        {/* Pseudocode */}
        <h2>Pseudocode</h2>
        <p>
          A simplified implementation showing the core decision loop. The actual
          implementation includes caching, tie-breaking, and mode-specific logic.
        </p>
        <pre><code>{content.pseudocode}</code></pre>

        {/* Strengths & Weaknesses */}
        <h2>Strengths</h2>
        <ul>
          {content.strengths.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>

        <h2>Weaknesses</h2>
        <ul>
          {content.weaknesses.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>

        {/* Try It */}
        <h2>Try It</h2>
        <p>
          See this strategy in action by playing an interactive game or watching
          a precomputed replay.
        </p>
        <div className="hero-actions">
          <Link className="primary-button" href="/play/standard">
            Play standard mode
          </Link>
          <Link className="secondary-button" href="/results">
            View benchmark results
          </Link>
        </div>
      </article>
    </main>
  );
}

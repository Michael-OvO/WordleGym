import katex from "katex";

type MathProps = {
  formula: string;
};

// Server-side KaTeX renderer. All formulas are hardcoded from our own
// source files — strategy-content.ts and strategy-card.tsx — never user input.
function renderKatex(formula: string, displayMode: boolean): string {
  return katex.renderToString(formula, {
    displayMode,
    throwOnError: false,
    strict: false,
  });
}

export function MathBlock({ formula }: MathProps) {
  return (
    <div
      className="math-block"
      dangerouslySetInnerHTML={{ __html: renderKatex(formula, true) }}
    />
  );
}

export function InlineMath({ formula }: MathProps) {
  return (
    <span
      className="math-inline"
      dangerouslySetInnerHTML={{ __html: renderKatex(formula, false) }}
    />
  );
}

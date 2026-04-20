import katex from "katex";

type MathBlockProps = {
  formula: string;
};

/**
 * Server-side rendered KaTeX block math.
 *
 * Security: All formulas are hardcoded strings from strategy-content.ts,
 * which is our own static source file — never user input.
 * KaTeX's own rendering is safe (it only produces math markup).
 */
export function MathBlock({ formula }: MathBlockProps) {
  const html = katex.renderToString(formula, {
    displayMode: true,
    throwOnError: false,
    strict: false,
  });

  return <div className="math-block" dangerouslySetInnerHTML={{ __html: html }} />;
}

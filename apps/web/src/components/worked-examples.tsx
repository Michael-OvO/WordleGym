import { InlineMath } from "@/components/math";
import { getWalkthroughs } from "@/lib/generated-data";
import type { EvilDpTurn } from "@/types/generated";

// Worked examples shown on the home page. Pairs one-to-one with the new
// passages in the paper: (A) the CRANE bucket partition that makes "entropy"
// tangible and demonstrates why AFTER and AMBER collide into the same bucket,
// and (B) the exact 4-turn evil-dp decision trace, including the top-K
// alternative guesses at each turn so the reader can see the quantity the
// DP actually optimizes and when lookahead beats greedy.

type TileState = "G" | "Y" | "B" | "";

function tileClass(state: TileState): string {
  if (state === "G") return "wx-tile tile-G";
  if (state === "Y") return "wx-tile tile-Y";
  if (state === "B") return "wx-tile tile-B";
  return "wx-tile tile-empty";
}

function MiniRow({ letters, pattern }: { letters: string; pattern: string }) {
  const chars = letters.padEnd(5, " ").slice(0, 5).toUpperCase().split("");
  const states = pattern.padEnd(5, "").slice(0, 5).split("") as TileState[];
  return (
    <div className="wx-row">
      {chars.map((char, idx) => (
        <div key={idx} className={tileClass(states[idx] ?? "")}>
          <span>{char.trim()}</span>
        </div>
      ))}
    </div>
  );
}

// ── Per-turn narrative for Demo B. The interesting case is turn 2, where
// the DP's pick (YAULD) is not the one-step minimizer (BLUDY / DUPLY at
// |T|=13). That's exactly where recursive lookahead beats greedy.
function turnNarrative(turn: EvilDpTurn): string {
  if (turn.turn === 1) {
    return "The five top candidates — RAISE, ARISE, AESIR, SERAI, REAIS — are anagrams of each other, so they all partition the candidate pool identically at |T|=168. The DP breaks the tie by partition entropy: RAISE has the highest at 5.878 bits, so RAISE wins.";
  }
  if (turn.turn === 2) {
    return "This is where recursive lookahead beats one-step greedy. BLUDY and DUPLY both shrink the adversary's next bucket to 13 — smaller than YAULD's 15 — so a greedy |T|-minimizer would pick them. But the DP computes D of each successor: YAULD's 15-candidate set has structural endings that solve in 2 more turns, while BLUDY's 13-candidate set requires 3. One-step reasoning picks the wrong guess here.";
  }
  if (turn.turn === 3) {
    return "TENCH is the only guess that reduces the adversary's pool to a single candidate, guaranteeing the solve on turn 4. BENCH, BUNCH, CHOON and the rest leave two — forcing a coin flip that would extend the game to turn 5 in the worst case.";
  }
  return "";
}

export async function WorkedExamples() {
  const walkthroughs = await getWalkthroughs();
  if (!walkthroughs) {
    return null;
  }

  const { crane_partition, opener_comparison, evil_dp_trace } = walkthroughs;
  const largestBucket = crane_partition.largest_bucket;
  const topBuckets = crane_partition.top_buckets.slice(0, 10);
  const byybySize = crane_partition.byyby_bucket_size;

  // Opener comparison rows — keep only the 5 best by entropy plus ADIEU as
  // the "bad opener" anchor so the scale is meaningful.
  const openerRows = opener_comparison.slice(0, 5);
  const adieu = opener_comparison.find((o) => o.guess === "adieu");
  if (adieu && !openerRows.some((o) => o.guess === "adieu")) {
    openerRows.push(adieu);
  }

  // Sample 18 words from the BYYBY bucket for the collision roster.
  const byybyPreview = crane_partition.byyby_bucket_words.slice(0, 18);

  return (
    <section className="worked-examples">
      <div className="section-header">
        <p className="eyebrow">Worked examples</p>
        <h2>How the math plays out</h2>
        <p>
          Two walkthroughs that follow the paper line-by-line — the partition
          histogram that makes &ldquo;entropy&rdquo; tangible, and the
          evil-DP&apos;s decision trace showing the alternatives it considered
          at each turn.
        </p>
      </div>

      {/* ─── A · Partition of CRANE ─────────────────────────────────── */}
      <article className="worked-example">
        <header className="worked-example-head">
          <p className="eyebrow-num">A · Partition of CRANE</p>
          <h3>What it means to split the candidates.</h3>
          <p>
            Every guess shatters the {crane_partition.total_candidates.toLocaleString()} possible
            answers into feedback buckets. <code>CRANE</code> produces{" "}
            <strong>{crane_partition.nonempty_buckets}</strong> non-empty
            buckets; the Shannon entropy of that split — the average bits of
            information extracted per guess — is{" "}
            <strong>{crane_partition.entropy.toFixed(3)} bits</strong>. Compare
            to the maximum possible{" "}
            <InlineMath formula="\log_2(2315) \approx 11.18" /> bits: one
            CRANE covers just over half the uncertainty.
          </p>
        </header>

        <div className="partition-widget">
          {/* Bar chart of the top-10 CRANE buckets */}
          <div className="partition-chart">
            <div className="partition-chart-head">
              <span className="partition-chart-label">Top 10 buckets by size</span>
              <span className="partition-chart-label partition-chart-label-right">
                {crane_partition.nonempty_buckets} non-empty · {crane_partition.total_candidates} total
              </span>
            </div>
            {topBuckets.map((bucket) => (
              <div key={bucket.pattern} className="partition-bar-row">
                <code className="partition-bar-pattern">{bucket.pattern}</code>
                <div className="partition-bar-track">
                  <div
                    className="partition-bar-fill"
                    style={{ width: `${(bucket.size / largestBucket) * 100}%` }}
                  />
                </div>
                <span className="partition-bar-count">{bucket.size}</span>
              </div>
            ))}
            <div className="partition-bar-row partition-bar-row-highlight">
              <code className="partition-bar-pattern">BYYBY</code>
              <div className="partition-bar-track">
                <div
                  className="partition-bar-fill partition-bar-fill-highlight"
                  style={{ width: `${(byybySize / largestBucket) * 100}%` }}
                />
              </div>
              <span className="partition-bar-count">{byybySize}</span>
            </div>
            <p className="partition-chart-note">
              The BYYBY bucket has rank 13 with 50 members — mid-sized and
              mixed-color, which is where most disambiguation happens on turn 2.
            </p>
          </div>

          {/* Formula callout */}
          <div className="partition-formula">
            <InlineMath
              formula={`H(\\text{CRANE}) = -\\sum_r p_r \\log_2 p_r = ${crane_partition.entropy.toFixed(3)}\\text{ bits}`}
            />
            <p className="partition-formula-note">
              Each <InlineMath formula="p_r = |B_r|/|C|" /> is the probability
              that the hidden answer produces feedback pattern{" "}
              <InlineMath formula="r" />. A perfectly balanced split (all
              buckets equal) would maximize this sum; a lopsided split (one
              giant bucket) collapses it toward zero. CRANE&apos;s biggest
              bucket is all-gray with {largestBucket} words, which is what
              costs it some entropy versus the best openers below.
            </p>
          </div>

          {/* Opener comparison table */}
          <div className="opener-comparison">
            <h4>CRANE against the leading openers</h4>
            <table>
              <thead>
                <tr>
                  <th>guess</th>
                  <th className="num">H (bits)</th>
                  <th className="num">|T| evil</th>
                  <th className="num">buckets</th>
                </tr>
              </thead>
              <tbody>
                {openerRows.map((o) => (
                  <tr
                    key={o.guess}
                    className={o.guess === "crane" ? "opener-row-self" : ""}
                  >
                    <td>
                      <code>{o.guess.toUpperCase()}</code>
                    </td>
                    <td className="num">{o.entropy.toFixed(3)}</td>
                    <td className="num">{o.evil_bucket}</td>
                    <td className="num">{o.num_buckets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              <code>SOARE</code> has the highest standard-mode entropy, but{" "}
              <code>RAISE</code> has the smallest adversarial bucket (|T|=168)
              — which is why <code>evil-dp</code> opens with{" "}
              <code>RAISE</code>, not with SOARE or the Bertsimas &amp;
              Paskov Standard-mode optimum SALET. Different games reward
              different openers.
            </p>
          </div>
        </div>

        {/* BYYBY collision visualization */}
        <div className="collision-bucket">
          <h4>
            Inside bucket <InlineMath formula="B_{\mathrm{BYYBY}}" /> — {byybySize} answers
            produce identical feedback against CRANE
          </h4>
          <div className="collision-bucket-words">
            {byybyPreview.map((w) => (
              <code key={w}>{w.toUpperCase()}</code>
            ))}
            <span className="collision-bucket-more">
              + {byybySize - byybyPreview.length} more
            </span>
          </div>
          <div className="collision-pair">
            <div className="collision-board">
              <span className="collision-label">answer · AFTER</span>
              <MiniRow letters="CRANE" pattern="BYYBY" />
            </div>
            <div className="collision-equals" aria-hidden="true">=</div>
            <div className="collision-board">
              <span className="collision-label">answer · AMBER</span>
              <MiniRow letters="CRANE" pattern="BYYBY" />
            </div>
          </div>
          <p>
            AFTER and AMBER are two of those {byybySize}. The player sees the
            same tiles for both answers after turn 1 — which is exactly why a
            good opener produces <em>many small</em> buckets instead of a few
            large ones. Entropy measures precisely that.
          </p>
        </div>
      </article>

      {/* ─── B · Evil-DP decision trace ─────────────────────────────── */}
      <article className="worked-example">
        <header className="worked-example-head">
          <p className="eyebrow-num">B · Evil-DP decision trace</p>
          <h3>What the DP actually considers.</h3>
          <p>
            The evil-DP doesn&apos;t pick the guess that reveals the most
            letters — it picks the guess whose <em>adversarial successor</em>{" "}
            has the shortest remaining game. Here are the top alternatives it
            ranked at each turn, and why the winner won. |T| is the
            adversary&apos;s next-bucket size; H is partition entropy in bits.
          </p>
        </header>

        <div className="dp-trace">
          {evil_dp_trace.slice(0, 3).map((turn) => {
            const topShown = turn.top_candidates.slice(0, 6);
            const chosenInTop = topShown.some((c) => c.is_chosen);
            if (!chosenInTop) {
              const chosen = turn.top_candidates.find((c) => c.is_chosen);
              if (chosen) {
                topShown.push(chosen);
              }
            }
            return (
              <div key={turn.turn} className="dp-turn">
                <header className="dp-turn-head">
                  <div className="dp-turn-label">
                    <span className="dp-turn-index">turn {turn.turn}</span>
                    <span className="dp-turn-decay">
                      <span className="dp-turn-count">{turn.candidates_before.toLocaleString()}</span>
                      <span className="dp-turn-arrow" aria-hidden="true">→</span>
                      <span className="dp-turn-count">{turn.candidates_after.toLocaleString()}</span>
                      <span className="dp-turn-label-inline">candidates</span>
                    </span>
                  </div>
                  <div className="dp-turn-outcome">
                    <span className="dp-turn-chose">chose</span>
                    <code>{turn.chosen.toUpperCase()}</code>
                    <span className="dp-turn-arrow-light" aria-hidden="true">→</span>
                    <span className="dp-turn-feedback">{turn.feedback_text}</span>
                  </div>
                </header>

                <table className="dp-alternatives">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>guess</th>
                      <th className="num">|T|</th>
                      <th className="num">H</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topShown.map((c) => (
                      <tr
                        key={c.guess}
                        className={c.is_chosen ? "dp-row-chosen" : ""}
                      >
                        <td className="dp-rank">{c.rank}</td>
                        <td>
                          <code>{c.guess.toUpperCase()}</code>
                          {c.is_chosen && (
                            <span className="dp-chosen-mark" aria-label="chosen">★</span>
                          )}
                        </td>
                        <td className="num">{c.evil_bucket}</td>
                        <td className="num">{c.entropy.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className={turn.turn === 2 ? "dp-narrative dp-narrative-key" : "dp-narrative"}>
                  {turnNarrative(turn)}
                </p>
              </div>
            );
          })}
        </div>

        <div className="dp-epilogue">
          <p>
            Turn 4 is trivial: a single candidate (<code>WHOOP</code>)
            remains, so the solver plays it and the adversary is forced to
            return all-green. Total game length: <strong>4 guesses</strong>,
            matching the published optimum <InlineMath formula="D(A) = 4" />.
            Every other deterministic benchmark policy takes 5.
          </p>
        </div>
      </article>
    </section>
  );
}

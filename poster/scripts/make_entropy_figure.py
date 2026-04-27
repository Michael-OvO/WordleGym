#!/usr/bin/env python3
"""Compact `expected-entropy` mechanism figure for the poster.

Three-panel layout (decision | distribution | ranking) showing what the
strategy decides, what metric it picks by, and where the chosen guess sits in
the leaderboard.

Output: poster/figures/entropy_mechanism.pdf
"""

from __future__ import annotations

import sys
from pathlib import Path

import matplotlib as mpl
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle

REPO = Path(__file__).resolve().parents[2]
ENGINE_SRC = REPO / "engine" / "src"
if str(ENGINE_SRC) not in sys.path:
    sys.path.insert(0, str(ENGINE_SRC))

from wordlegym.analysis import FeedbackTable
from wordlegym.corpus import WordCorpus
from wordlegym.metrics import shannon_entropy

# Minimal three-color palette: navy for emphasis, blue for the chosen guess,
# warm gray for everything else.
NAVY = "#012169"
ACCENT = "#2563EB"
NEUTRAL = "#94A3B8"
TEXT_DIM = "#4A5568"
GRID = "#E5E7EB"
TILE_FILL = "#787C7E"

# Non-answer openers worth ranking alongside the 2,315 answer-set guesses.
EXTRA_OPENERS = (
    "soare", "roate", "raile", "salet", "slane", "saine", "slate",
    "trace", "crate", "crane", "carle", "cline", "adieu", "audio",
)

# Figure layout constants — kept at module scope so tile aspect can be
# computed from the same numbers used to lay out the gridspec.
FIG_W, FIG_H = 15.0, 2.7
LEFT, RIGHT, TOP, BOTTOM = 0.025, 0.985, 0.88, 0.20
WIDTH_RATIOS = (1.05, 2.2, 1.25)
WSPACE = 0.18


def compute_entropy_table(table: FeedbackTable, candidates: tuple[str, ...]):
    """Return list of (guess, H, n_buckets, largest) sorted by H descending."""
    answer_words = table.corpus.answers
    pool = list(dict.fromkeys(answer_words + EXTRA_OPENERS))
    rows = []
    for guess in pool:
        if guess not in table.corpus.allowed_set:
            continue
        counts = table.partition_counts(guess, candidates)
        H = shannon_entropy(counts)
        sizes = list(counts.values())
        rows.append((guess, H, len(sizes), max(sizes)))
    rows.sort(key=lambda x: (-x[1], x[3], x[0]))
    return rows


def panel_aspect_ratio(panel_index: int) -> float:
    """Width-over-height ratio of a gridspec panel in physical inches.

    Solves the gridspec layout in closed form: with `n` panels,
    `wspace = gap / mean_panel_width`, the total horizontal slot is
    `n * mean_panel_w + (n-1) * wspace * mean_panel_w`, so each panel's
    width is `mean_panel_w * (ratio_i / mean_ratio)`. Used to keep tiles
    square in display space — drawing in axes-normalized coords without
    this correction stretches them with the panel.
    """
    n = len(WIDTH_RATIOS)
    mean_ratio = sum(WIDTH_RATIOS) / n
    avail_w_frac = (RIGHT - LEFT)
    mean_panel_w_frac = avail_w_frac / (n + (n - 1) * WSPACE)
    panel_w_frac = mean_panel_w_frac * (WIDTH_RATIOS[panel_index] / mean_ratio)
    panel_w_in = panel_w_frac * FIG_W
    panel_h_in = (TOP - BOTTOM) * FIG_H
    return panel_w_in / panel_h_in


def draw_wordle_tiles(ax, word, *, x0, y0, tile_w, tile_h, gap_w):
    """Draw a row of solid Wordle tiles in data coords with explicit w/h."""
    for i, ch in enumerate(word.upper()):
        rect = FancyBboxPatch(
            (x0 + i * (tile_w + gap_w), y0),
            tile_w, tile_h,
            boxstyle="round,pad=0.0,rounding_size=0.005",
            linewidth=0, facecolor=TILE_FILL, edgecolor="none",
        )
        ax.add_patch(rect)
        ax.text(
            x0 + i * (tile_w + gap_w) + tile_w / 2,
            y0 + tile_h / 2,
            ch,
            ha="center", va="center",
            color="white", fontsize=22, fontweight="bold",
        )


def main() -> None:
    corpus = WordCorpus.from_repo_root(REPO)
    table = FeedbackTable(corpus)
    answers = corpus.answers

    rankings = compute_entropy_table(table, answers)
    chosen_guess, chosen_H, chosen_buckets, chosen_largest = rankings[0]

    counts = table.partition_counts(chosen_guess, answers)
    sorted_sizes = sorted(counts.values(), reverse=True)

    contrast_names = {"crane", "adieu"}
    top_rows = rankings[:5]
    extra_rows = [r for r in rankings if r[0] in contrast_names]

    mpl.rcParams.update({
        "font.family": "sans-serif",
        "font.sans-serif": ["Helvetica", "Arial", "DejaVu Sans"],
        "font.size": 12,
        "axes.spines.top": False,
        "axes.spines.right": False,
    })

    fig = plt.figure(figsize=(FIG_W, FIG_H))
    gs = fig.add_gridspec(
        nrows=1, ncols=3,
        width_ratios=list(WIDTH_RATIOS),
        wspace=WSPACE, left=LEFT, right=RIGHT, top=TOP, bottom=BOTTOM,
    )

    # ── Panel 1 — decision ──────────────────────────────────────────────────
    # Every element in this panel is positioned with explicit `gap` constants
    # between it and its neighbours, so that shrinking the figure or changing
    # the font cannot cause text to land on top of another element.
    axL = fig.add_subplot(gs[0, 0])
    axL.set_xlim(0, 1)
    axL.set_ylim(0, 1)
    axL.axis("off")

    title_y = 0.97
    axL.text(0.0, title_y, "Decision  (turn 1)",
             fontsize=11.5, color=TEXT_DIM, weight="bold",
             ha="left", va="top", transform=axL.transAxes,
             family="monospace")

    # Tiles: pick width in axes coords, then derive height so the rendered
    # rectangle is square in display inches.
    aspect = panel_aspect_ratio(0)
    tile_w = 0.155
    gap_w = 0.012
    tile_h = tile_w * aspect
    row_w = 5 * tile_w + 4 * gap_w
    x0 = (1 - row_w) / 2
    title_to_tile_gap = 0.13
    tile_y0 = title_y - title_to_tile_gap - tile_h
    draw_wordle_tiles(axL, chosen_guess, x0=x0, y0=tile_y0,
                      tile_w=tile_w, tile_h=tile_h, gap_w=gap_w)

    tile_to_caption_gap = 0.09
    caption_y = tile_y0 - tile_to_caption_gap
    axL.text(0.5, caption_y, "argmax  expected entropy",
             fontsize=11, color=NAVY, weight="bold",
             ha="center", va="top", transform=axL.transAxes)

    caption_to_stats_gap = 0.13
    stats_y = caption_y - caption_to_stats_gap
    line_h = 0.092
    stats = [
        (r"candidates  $|C|$", f"{len(answers):,}"),
        ("non-empty buckets", f"{chosen_buckets}"),
        ("largest bucket", f"{chosen_largest}"),
        (r"entropy  $H(g)$", f"{chosen_H:.3f} bits"),
    ]
    for i, (label, value) in enumerate(stats):
        y = stats_y - i * line_h
        axL.text(0.05, y, label, fontsize=11, color=TEXT_DIM,
                 ha="left", va="center", transform=axL.transAxes)
        axL.text(0.95, y, value, fontsize=11, color=NAVY, weight="bold",
                 ha="right", va="center", transform=axL.transAxes,
                 family="monospace")

    # ── Panel 2 — distribution ──────────────────────────────────────────────
    axM = fig.add_subplot(gs[0, 1])
    n_buckets = len(sorted_sizes)
    xs = list(range(n_buckets))
    axM.bar(xs, sorted_sizes, color=ACCENT, width=1.0,
            edgecolor="white", linewidth=0.0)
    axM.bar([0], [sorted_sizes[0]], color=NAVY, width=1.0,
            edgecolor="white", linewidth=0.0)

    axM.set_xlim(-1, n_buckets)
    axM.set_ylim(0, sorted_sizes[0] * 1.18)
    axM.set_xlabel(
        f"feedback partition  (all {n_buckets} non-empty buckets, sorted by size)",
        fontsize=11, color=TEXT_DIM,
    )
    axM.set_ylabel("# answers in bucket", fontsize=11, color=TEXT_DIM)
    axM.tick_params(length=2, colors=TEXT_DIM)
    axM.grid(axis="y", alpha=0.4, linestyle=":", color=GRID)
    axM.set_axisbelow(True)
    for spine in ("left", "bottom"):
        axM.spines[spine].set_color(TEXT_DIM)

    axM.text(
        0.5, 1.08,
        r"$H(g)\,=\,\sum_{r}\, p(r)\,\log_{2}(1/p(r))\,=\,"
        + f"{chosen_H:.3f}$  bits",
        fontsize=13, color=NAVY, ha="center", va="bottom",
        transform=axM.transAxes,
    )

    # ── Panel 3 — ranking ───────────────────────────────────────────────────
    axR = fig.add_subplot(gs[0, 2])
    axR.set_xlim(0, 1)
    axR.set_ylim(0, 1)
    axR.axis("off")

    title_y = 0.97
    axR.text(0.0, title_y, "Ranking  by  H(g)",
             fontsize=11.5, color=TEXT_DIM, weight="bold",
             ha="left", va="top", transform=axR.transAxes,
             family="monospace")

    # Explicit gap between the panel's "Ranking by H(g)" title and the
    # column-header row beneath. Without this, shrinking the figure puts the
    # two texts on top of each other.
    # Wider than the inter-row spacing so the title visually outranks the
    # column-header strip — the eye reads "Ranking by H(g)" as the panel
    # heading, not as just another row.
    title_to_header_gap = 0.19
    header_y = title_y - title_to_header_gap
    col_x = (0.04, 0.18, 0.70, 0.97)
    header_align = ("left", "left", "right", "right")
    headers = ("#", "guess", "H  bits", "|B_max|")
    for x, h, align in zip(col_x, headers, header_align):
        axR.text(x, header_y, h, fontsize=11, color=TEXT_DIM,
                 ha=align, va="bottom", transform=axR.transAxes,
                 family="monospace")
    axR.add_patch(Rectangle(
        (0.02, header_y - 0.022), 0.96, 0.003,
        transform=axR.transAxes, color=NAVY, linewidth=0,
    ))

    header_to_row_gap = 0.11
    row_y = header_y - header_to_row_gap
    row_h = 0.10
    for i, (guess, H, _, largest) in enumerate(top_rows):
        y = row_y - i * row_h
        if i == 0:
            axR.add_patch(Rectangle(
                (-0.01, y - row_h * 0.42), 1.02, row_h * 0.85,
                transform=axR.transAxes,
                color=ACCENT, alpha=0.12, linewidth=0,
            ))
            color = NAVY
            weight = "bold"
        else:
            color = "#1F2937"
            weight = "normal"
        axR.text(col_x[0], y, f"{i+1}", fontsize=11.5, color=color,
                 weight=weight, ha="left", va="center",
                 transform=axR.transAxes, family="monospace")
        axR.text(col_x[1], y, guess.upper(), fontsize=11.5, color=color,
                 weight=weight, ha="left", va="center",
                 transform=axR.transAxes, family="monospace")
        axR.text(col_x[2], y, f"{H:.3f}", fontsize=11.5, color=color,
                 weight=weight, ha="right", va="center",
                 transform=axR.transAxes, family="monospace")
        axR.text(col_x[3], y, f"{largest}", fontsize=11.5, color=color,
                 weight=weight, ha="right", va="center",
                 transform=axR.transAxes, family="monospace")

    # Explicit gap between the last data row and the divider line.
    rows_to_divider_gap = 0.06
    div_y = row_y - (len(top_rows) - 1) * row_h - row_h * 0.5 - rows_to_divider_gap
    axR.add_patch(Rectangle(
        (0.0, div_y), 1.0, 0.0015,
        transform=axR.transAxes, color=GRID, linewidth=0,
    ))

    # Explicit gap between the divider and the "for contrast" label.
    divider_to_label_gap = 0.05
    axR.text(0.0, div_y - divider_to_label_gap, "for contrast",
             fontsize=10, color=TEXT_DIM, style="italic",
             ha="left", va="center", transform=axR.transAxes)

    # Explicit gap between the "for contrast" label and the first extra row.
    label_to_extra_gap = 0.08
    extra_y = div_y - divider_to_label_gap - label_to_extra_gap
    for j, (guess, H, _, largest) in enumerate(extra_rows):
        y = extra_y - j * row_h
        rank = next(idx for idx, r in enumerate(rankings) if r[0] == guess) + 1
        axR.text(col_x[0], y, f"{rank}", fontsize=11.5, color=TEXT_DIM,
                 ha="left", va="center", transform=axR.transAxes,
                 family="monospace")
        axR.text(col_x[1], y, guess.upper(), fontsize=11.5, color=NEUTRAL,
                 weight="bold", ha="left", va="center",
                 transform=axR.transAxes, family="monospace")
        axR.text(col_x[2], y, f"{H:.3f}", fontsize=11.5, color="#1F2937",
                 ha="right", va="center", transform=axR.transAxes,
                 family="monospace")
        axR.text(col_x[3], y, f"{largest}", fontsize=11.5, color="#1F2937",
                 ha="right", va="center", transform=axR.transAxes,
                 family="monospace")

    out = REPO / "poster" / "figures" / "entropy_mechanism.pdf"
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, bbox_inches="tight", pad_inches=0.06)
    print(f"wrote {out}  (chosen={chosen_guess.upper()}, H={chosen_H:.3f})")


if __name__ == "__main__":
    main()

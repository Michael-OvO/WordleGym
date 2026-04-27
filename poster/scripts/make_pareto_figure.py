#!/usr/bin/env python3
"""Pareto frontier of strategies: average vs. worst-case guesses, Standard mode.

Each strategy gets its own colour so the legend is decodable; the published
optimum is a black star. Legend sits in the lower-right of the axes, inside
the empty data region — no point overlaps it.

Output: poster/figures/pareto_scatter.pdf
"""

from __future__ import annotations

from pathlib import Path

import matplotlib as mpl
import matplotlib.pyplot as plt

REPO = Path(__file__).resolve().parents[2]

# Strategy palette — mirrors the writeup `\definecolor{strat...}` blocks so
# the poster's colour key reads consistently with the supplement.
NAVY = "#012169"
TEXT_DIM = "#4A5568"
GRID = "#E5E7EB"
COLOR_ENTROPY    = "#2563EB"  # blue
COLOR_POSTEXP    = "#0891B2"  # teal
COLOR_MINIMAX    = "#EF4444"  # red
COLOR_LETTERFREQ = "#F59E0B"  # amber
COLOR_RANDOM     = "#94A3B8"  # gray
COLOR_OPTIMUM    = "#000000"

# (label, x=avg, y=worst, color, marker, marker_size)
POINTS = [
    ("expected-entropy",     3.465, 6, COLOR_ENTROPY,    "o", 130),
    ("posterior-expectimax", 3.485, 5, COLOR_POSTEXP,    "o", 130),
    ("minimax",              3.573, 6, COLOR_MINIMAX,    "o", 130),
    ("letter-frequency",     3.587, 8, COLOR_LETTERFREQ, "o", 130),
    ("random-valid",         4.124, 9, COLOR_RANDOM,     "o", 130),
    ("published optimum",    3.421, 5, COLOR_OPTIMUM,    "*", 320),
]


def main() -> None:
    mpl.rcParams.update({
        "font.family": "sans-serif",
        "font.sans-serif": ["Helvetica", "Arial", "DejaVu Sans"],
        "font.size": 12,
        "axes.spines.top": False,
        "axes.spines.right": False,
    })

    fig, ax = plt.subplots(figsize=(7.6, 2.5))
    # Explicit margins so both side-by-side figures (Pareto + Posterior) end
    # up with the *same* plot-area position when scaled to \linewidth in the
    # poster — guarantees vertical alignment of axes baselines & top edges.
    fig.subplots_adjust(left=0.13, right=0.97, top=0.94, bottom=0.18)

    for label, x, y, color, marker, ms in POINTS:
        ax.scatter([x], [y], s=ms, color=color, marker=marker,
                   edgecolor="white", linewidth=1.0,
                   zorder=3 if marker == "o" else 4, label=label)

    ax.set_xlabel("Average guesses (Standard mode)",
                  fontsize=11, color=TEXT_DIM)
    ax.set_ylabel("Worst-case guesses", fontsize=11, color=TEXT_DIM)
    ax.set_xlim(3.36, 4.30)
    ax.set_ylim(4.45, 9.55)
    ax.set_yticks([5, 6, 7, 8, 9])
    ax.tick_params(length=2, colors=TEXT_DIM)
    ax.grid(True, linestyle=":", alpha=0.5, color=GRID)
    ax.set_axisbelow(True)
    for spine in ("left", "bottom"):
        ax.spines[spine].set_color(TEXT_DIM)

    leg = ax.legend(
        loc="lower right", bbox_to_anchor=(0.985, 0.04),
        frameon=False, fontsize=10.5,
        prop={"family": "monospace", "size": 10.5},
        handlelength=1.0, handletextpad=0.6, borderaxespad=0.0,
        labelspacing=0.4,
    )
    for text in leg.get_texts():
        text.set_color(NAVY)

    out = REPO / "poster" / "figures" / "pareto_scatter.pdf"
    # No bbox_inches="tight" — we control margins via subplots_adjust above
    # so the canvas keeps the figsize we asked for.
    fig.savefig(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()

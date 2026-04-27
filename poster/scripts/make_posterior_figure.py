#!/usr/bin/env python3
"""Posterior concentration over turns in Unknown mode.

Clean line plot: two curves, legend, 0.99 reference line, nothing else.

Output: poster/figures/posterior_concentration.pdf
"""

from __future__ import annotations

from pathlib import Path

import matplotlib as mpl
import matplotlib.pyplot as plt

REPO = Path(__file__).resolve().parents[2]

NAVY = "#012169"
ACCENT = "#2563EB"
NEUTRAL = "#94A3B8"
TEXT_DIM = "#4A5568"
GRID = "#E5E7EB"

TURNS = [1, 2, 3, 4, 5]
ENTROPY_CURVE = [0.9267, 0.9936, 0.9991, 0.9993, 0.9920]
RANDOM_CURVE  = [0.8268, 0.9789, 0.9960, 0.9989, 0.9990]


def main() -> None:
    mpl.rcParams.update({
        "font.family": "sans-serif",
        "font.sans-serif": ["Helvetica", "Arial", "DejaVu Sans"],
        "font.size": 12,
        "axes.spines.top": False,
        "axes.spines.right": False,
    })

    fig, ax = plt.subplots(figsize=(7.6, 2.5))
    # Explicit margins matching the Pareto figure so both blocks align
    # vertically when scaled to \linewidth side-by-side in the poster.
    fig.subplots_adjust(left=0.13, right=0.97, top=0.94, bottom=0.18)

    ax.plot(TURNS, ENTROPY_CURVE, color=ACCENT, marker="o", markersize=8,
            linewidth=2.4, label="expected-entropy")
    ax.plot(TURNS, RANDOM_CURVE, color=NEUTRAL, marker="s", markersize=8,
            linewidth=2.4, label="random-valid")

    ax.axhline(0.99, color=TEXT_DIM, linestyle="--", linewidth=1.0, alpha=0.55)

    ax.set_xlabel("Turn", fontsize=11, color=TEXT_DIM)
    ax.set_ylabel("Mean posterior on true mode",
                  fontsize=11, color=TEXT_DIM)
    ax.set_xticks(TURNS)
    ax.set_xlim(0.85, 5.25)
    ax.set_ylim(0.80, 1.01)
    ax.set_yticks([0.80, 0.85, 0.90, 0.95, 1.00])
    ax.tick_params(length=2, colors=TEXT_DIM)
    ax.grid(True, linestyle=":", alpha=0.5, color=GRID)
    ax.set_axisbelow(True)
    for spine in ("left", "bottom"):
        ax.spines[spine].set_color(TEXT_DIM)

    leg = ax.legend(
        loc="lower right", frameon=False, fontsize=11,
        prop={"family": "monospace", "size": 11},
    )
    for text in leg.get_texts():
        text.set_color(NAVY)

    out = REPO / "poster" / "figures" / "posterior_concentration.pdf"
    fig.savefig(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()

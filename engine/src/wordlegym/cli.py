from __future__ import annotations

import argparse
import logging
from pathlib import Path

from .benchmark import BenchmarkRunner


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def main() -> None:
    parser = argparse.ArgumentParser(description="WordleGym engine CLI")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable debug logging.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("generate", help="Generate raw traces and web artifacts.")
    subparsers.add_parser("sync-web-data", help="Copy generated data into the web app public directory.")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    runner = BenchmarkRunner(repo_root())
    if args.command == "generate":
        runner.write_outputs()
    elif args.command == "sync-web-data":
        runner.sync_web_data()


if __name__ == "__main__":
    main()

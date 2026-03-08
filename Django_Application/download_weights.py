"""
Wrapper to run the repo-root `download_weights.py` from inside `Django Application/`.

Why this exists:
  Many users run:
    python download_weights.py --base-url "..."
  while their working directory is `Django Application/`.
  The canonical script lives at repo root, so this wrapper forwards execution.
"""

import os
import runpy
import sys


def main() -> None:
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    target = os.path.join(repo_root, "download_weights.py")

    if not os.path.exists(target):
        raise FileNotFoundError(f"Expected root script at: {target}")

    # Execute root script as __main__ while preserving CLI args.
    sys.path.insert(0, repo_root)
    runpy.run_path(target, run_name="__main__")


if __name__ == "__main__":
    main()


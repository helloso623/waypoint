#!/usr/bin/env python3
"""After git pull: refresh Python deps and re-apply local AI env keys.

Run from anywhere:
  python plan/scripts/post_pull.py
  python plan/scripts/post_pull.py --no-pull   # deps + local AI only
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

PLAN_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = PLAN_DIR.parent
SETUP = Path(__file__).resolve().parent / "setup_local_ai.py"


def run(cmd: list[str], cwd: Path) -> int:
    print("+", " ".join(cmd))
    proc = subprocess.run(cmd, cwd=cwd)
    return proc.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Re-apply Waypoint deps and local AI after a pull")
    parser.add_argument("--no-pull", action="store_true", help="Skip git pull --ff-only")
    args = parser.parse_args()

    if not args.no_pull:
        code = run(["git", "pull", "--ff-only"], REPO_DIR)
        if code != 0:
            print("git pull failed — fix the checkout, then re-run this script.")
            return code

    req = PLAN_DIR / "requirements.txt"
    if req.is_file():
        code = run([sys.executable, "-m", "pip", "install", "-r", str(req)], REPO_DIR)
        if code != 0:
            print("pip install failed — local AI setup will still run.")
    else:
        print(f"no requirements.txt at {req}")

    setup_code = run([sys.executable, str(SETUP)], PLAN_DIR)
    print("Restart the app to load new backend code: python desktop.py")
    return setup_code


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env bash
# Thin wrapper so `./plan/scripts/setup_local_ai.sh` works after a pull.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$HERE/setup_local_ai.py" "$@"

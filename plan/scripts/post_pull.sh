#!/usr/bin/env bash
# git pull + pip + local AI env. Restart desktop.py / app.py afterwards.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$HERE/post_pull.py" "$@"

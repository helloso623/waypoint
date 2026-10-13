#!/usr/bin/env bash
# Start Waypoint on Tailscale.
# Usage:
#   ./run_tailscale.sh
#   ./run_tailscale.sh --direct
#   ./run_tailscale.sh --trust
set -euo pipefail
cd "$(dirname "$0")"
exec python3 ./run_tailscale.py "$@"

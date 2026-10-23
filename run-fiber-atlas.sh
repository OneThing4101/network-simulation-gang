#!/usr/bin/env bash
# One command to bring the studio up on a clean machine.
#   bash run-fiber-atlas.sh            start (and open the browser)
#   bash run-fiber-atlas.sh --stop     stop the server it started
#   bash run-fiber-atlas.sh --no-browser  start without opening a browser
set -euo pipefail

FIBER_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$FIBER_DIR"

# The environment lives inside the repository, so the project is portable.
FIBER_PY="$FIBER_DIR/.venv/bin/python"
if [[ ! -x "$FIBER_PY" ]]; then
  if command -v uv >/dev/null 2>&1; then
    uv venv --python 3.12 "$FIBER_DIR/.venv"
  else
    python3.12 -m venv "$FIBER_DIR/.venv"
  fi
fi
if ! "$FIBER_PY" -c 'import flask, networkx, shapely, scipy, pyproj' 2>/dev/null; then
  if command -v uv >/dev/null 2>&1; then
    uv pip install --python "$FIBER_PY" -r requirements.txt
  else
    "$FIBER_PY" -m pip install -r requirements.txt
  fi
fi
if [[ ! -f data/routes.cache.json || ! -f data/rivers.geojson ]]; then
  "$FIBER_PY" scripts/prepare_data.py
fi
if [[ ! -f frontend/dist/index.html ]]; then
  (cd frontend && npm ci --no-audit --no-fund && npm run build)
fi
exec "$FIBER_PY" scripts/launch.py "$@"

#!/usr/bin/env bash
set -euo pipefail
FIBER_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$FIBER_DIR"
FIBER_PY="$FIBER_DIR/../.venv-jupyter/bin/python"
if [[ ! -x "$FIBER_PY" ]]; then
  FIBER_PY="$FIBER_DIR/.venv/bin/python"
  if [[ ! -x "$FIBER_PY" ]]; then
    uv venv --python 3.12 "$FIBER_DIR/.venv"
  fi
fi
if ! "$FIBER_PY" -c 'import flask, networkx, shapely, scipy, pyproj' 2>/dev/null; then
  uv pip install --python "$FIBER_PY" -r requirements.txt
fi
if [[ ! -f data/routes.cache.json || ! -f data/rivers.geojson ]]; then
  "$FIBER_PY" scripts/prepare_data.py
fi
if [[ ! -f frontend/dist/index.html ]]; then
  (cd frontend && npm ci --no-audit --no-fund && npm run build)
fi
exec "$FIBER_PY" scripts/launch.py "$@"

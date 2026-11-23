#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

.venv/bin/pip install --quiet pyinstaller
.venv/bin/pyinstaller \
  --onefile \
  --name brain-museum-studio \
  --add-data "muse2_studio/static:muse2_studio/static" \
  --hidden-import uvicorn.logging \
  --hidden-import uvicorn.loops.auto \
  --hidden-import uvicorn.protocols.http.auto \
  --hidden-import uvicorn.protocols.websockets.auto \
  --hidden-import uvicorn.lifespan.on \
  muse2_studio/cli.py

echo "✅ Standalone Linux binary built at: dist/brain-museum-studio"

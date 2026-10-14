#!/bin/bash
set -euo pipefail
prototype_root="$(cd "$(dirname "$0")/.." && pwd)"
solidcraft_root="$(cd "$prototype_root/../upstream-solidcraft" && pwd)"
web_root="$solidcraft_root/apps/solidcraft-web"
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$PATH"
apple_index="$(mktemp "$web_root/index-apple.XXXXXX.html")"
trap 'rm -f "$apple_index"' EXIT
python3 - "$web_root/index.html" "$apple_index" <<'PY'
from pathlib import Path
import sys
Path(sys.argv[2]).write_text(Path(sys.argv[1]).read_text().replace('data-wasm-opt="z"', 'data-wasm-opt="0"'))
PY
cd "$web_root"
CARGO_BUILD_JOBS=4 CARGO_TARGET_DIR="$solidcraft_root/target" CARGO_PROFILE_RELEASE_LTO=false \
  env -u NO_COLOR trunk build "$apple_index" --release --public-url ./ --no-sri
python3 "$prototype_root/scripts/bundle-local-web.py"

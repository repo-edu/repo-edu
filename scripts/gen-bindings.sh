#!/usr/bin/env bash
set -euo pipefail

# Generate TypeScript bindings from Rust types with hash-based caching.
# Skips regeneration if input files haven't changed since last run.
#
# Usage:
#   ./gen-bindings.sh         # Hash-based skip if unchanged
#   ./gen-bindings.sh --force # Always regenerate

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/repo-manage"
HASH_FILE="$APP_DIR/.bindings-hash"

# Parse arguments
FORCE=false
if [ "${1:-}" = "--force" ]; then
  FORCE=true
fi

# Compute hash of all input files that affect binding generation
compute_hash() {
  find "$APP_DIR/src-tauri/src" "$APP_DIR/repo-manage-core/src/settings" \
    -name "*.rs" -print0 2>/dev/null | \
    sort -z | \
    xargs -0 cat 2>/dev/null | \
    shasum -a 256 | \
    cut -d' ' -f1
}

CURRENT_HASH=$(compute_hash)

# Check if we can skip
if [ "$FORCE" = false ] && [ -f "$HASH_FILE" ]; then
  STORED_HASH=$(cat "$HASH_FILE")
  if [ "$STORED_HASH" = "$CURRENT_HASH" ]; then
    echo "[bindings] No changes detected, skipping regeneration."
    exit 0
  fi
fi

echo "[bindings] Regenerating TypeScript bindings..."
cd "$APP_DIR"
cargo run -p repo-manage-tauri --bin export_bindings

# Update hash after successful generation
echo "$CURRENT_HASH" > "$HASH_FILE"
echo "[bindings] Done. Hash updated."

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
  if ! command -v rg >/dev/null 2>&1; then
    echo "[bindings] Error: ripgrep (rg) is required to compute the bindings hash." >&2
    echo "[bindings] Install rg or update the hash logic to avoid this dependency." >&2
    exit 1
  fi

  local pattern
  pattern='specta::specta|tauri_specta::command|tauri_specta::collect_commands|specta::Type|derive\([^)]*\bType\b|impl\s+.*\bType\b'

  local files=()
  local filtered
  if ! filtered=$(rg -l "$pattern" \
    "$APP_DIR/src-tauri" \
    "$APP_DIR/repo-manage-core" \
    -g "*.rs" 2>/dev/null); then
    echo "[bindings] Error: failed to scan Rust files for specta/tauri-specta usage." >&2
    exit 1
  fi

  if [ -n "$filtered" ]; then
    while IFS= read -r file; do
      files+=("$file")
    done <<< "$filtered"
  fi

  # Always include key entrypoints that affect binding generation.
  if [ -f "$APP_DIR/src-tauri/src/lib.rs" ]; then
    files+=("$APP_DIR/src-tauri/src/lib.rs")
  else
    echo "[bindings] Error: expected specta builder entrypoint missing: $APP_DIR/src-tauri/src/lib.rs" >&2
    exit 1
  fi
  if [ -f "$APP_DIR/src-tauri/src/bin/export_bindings.rs" ]; then
    files+=("$APP_DIR/src-tauri/src/bin/export_bindings.rs")
  else
    echo "[bindings] Error: expected export binary missing: $APP_DIR/src-tauri/src/bin/export_bindings.rs" >&2
    exit 1
  fi

  if [ "${#files[@]}" -eq 0 ]; then
    echo "[bindings] Error: no Rust files matched the specta/tauri-specta filter." >&2
    echo "[bindings] Update the pattern or fall back to hashing all relevant .rs files." >&2
    exit 1
  fi

  printf '%s\0' "${files[@]}" | \
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

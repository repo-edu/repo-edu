#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
HOOK_SOURCE="$ROOT_DIR/scripts/hooks/pre-commit"
HOOK_TARGET="$ROOT_DIR/.git/hooks/pre-commit"

if [ ! -f "$HOOK_SOURCE" ]; then
  echo "[install-hook] source hook not found at $HOOK_SOURCE" >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/.git/hooks"
ln -sf "../../scripts/hooks/pre-commit" "$HOOK_TARGET"
chmod +x "$HOOK_SOURCE" "$HOOK_TARGET"

echo "[install-hook] pre-commit hook installed -> $HOOK_TARGET"

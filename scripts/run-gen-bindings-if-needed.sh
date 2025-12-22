#!/usr/bin/env bash
set -euo pipefail

# Run TS binding generation only when staged or working changes touch relevant Rust surfaces.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

CHANGED_FILES=$(git diff --name-only --cached -- "apps/repo-manage/repo-manage-core/src/settings" "apps/repo-manage/src-tauri/src" "apps/repo-manage/src-tauri/Cargo.toml")

if [ -z "$CHANGED_FILES" ]; then
  CHANGED_FILES=$(git diff --name-only -- "apps/repo-manage/repo-manage-core/src/settings" "apps/repo-manage/src-tauri/src" "apps/repo-manage/src-tauri/Cargo.toml")
fi

if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

echo "[bindings] Relevant changes detected. Regenerating TS bindings..."
pnpm --filter @repo-edu/repo-manage gen:bindings

# Ensure the generated file is staged if we’re in a pre-commit context
if git rev-parse --verify --quiet HEAD >/dev/null 2>&1; then
  git add apps/repo-manage/src/bindings.ts || true
fi

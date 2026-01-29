#!/usr/bin/env zsh

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
patch_file="${repo_root:h}/changes.patch"

git add -A
git diff --cached > "$patch_file"
echo "Patch written to: $patch_file"

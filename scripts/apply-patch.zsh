#!/usr/bin/env zsh

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
patch_file="${repo_root:h}/changes.patch"

if [[ ! -f "$patch_file" ]]; then
    echo "Patch file not found: $patch_file" >&2
    exit 1
fi

git apply "$patch_file"
echo "Applied patch from: $patch_file"

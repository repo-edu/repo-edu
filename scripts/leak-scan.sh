#!/usr/bin/env bash
# Leak scan before a commit: credentials and email addresses in every tracked file as staged.
# The rules are in leak-scan.md.
#
# Betterleaks has no tracked-tree mode: `dir` walks the file system with .gitignore unread, and
# `git` reads commit diffs. So the staged tree is exported once and scanned as one folder, where
# Betterleaks also finds .betterleaks.toml on its own.

set -euo pipefail

if ! command -v betterleaks >/dev/null 2>&1; then
  printf 'leak-scan: betterleaks is not installed; run: brew install betterleaks\n' >&2
  exit 1
fi

tree=$(mktemp -d "${TMPDIR:-/tmp}/leak-scan.XXXXXX")
trap 'rm -rf "$tree"' EXIT
git archive "$(git write-tree)" | tar -x -C "$tree"
betterleaks dir --no-banner -v "$tree"

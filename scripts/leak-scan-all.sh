#!/usr/bin/env sh
# Credential scan of every tracked file at HEAD. The rules are in leak-scan.md.
#
# Betterleaks has no tracked-tree mode: `dir` walks the file system with .gitignore unread, and
# `git` reads commit diffs. Passing the tracked files one by one is slow, because each command-line
# path is a scan source of its own. So the tree is exported once and scanned as one folder, where
# Betterleaks also finds .betterleaks.toml on its own.

set -eu

if ! command -v betterleaks >/dev/null 2>&1; then
  printf 'leak-scan-all: betterleaks is not installed; run: brew install betterleaks\n' >&2
  exit 1
fi

tree=$(mktemp -d "${TMPDIR:-/tmp}/leak-scan-all.XXXXXX")
trap 'rm -rf "$tree"' EXIT

git archive HEAD | tar -x -C "$tree"
betterleaks dir --no-banner "$tree"

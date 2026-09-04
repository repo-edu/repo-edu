#!/usr/bin/env sh
# Leak scan of the whole staged tree: credentials and emails in every tracked file as staged.
# The rules are in leak-scan.md.
#
# Betterleaks has no tracked-tree mode: `dir` walks the file system with .gitignore unread, and
# `git` reads commit diffs. Passing the tracked files one by one is slow, because each command-line
# path is a scan source of its own. So the staged tree is exported once and scanned as one folder,
# where Betterleaks also finds .betterleaks.toml on its own.

set -u
. "$(dirname "$0")/leak-scan-patterns.sh"

if ! command -v betterleaks >/dev/null 2>&1; then
  printf 'leak-scan-all: betterleaks is not installed; run: brew install betterleaks\n' >&2
  exit 1
fi

status=0

tree=$(mktemp -d "${TMPDIR:-/tmp}/leak-scan-all.XXXXXX")
trap 'rm -rf "$tree"' EXIT
git archive "$(git write-tree)" | tar -x -C "$tree"
betterleaks dir --no-banner -v "$tree" || status=1

report_staged_emails || status=1

exit "$status"

#!/usr/bin/env sh
# Leak scan before a commit: credentials in the staged changes, emails in the whole staged tree.
# The rules are in leak-scan.md.

set -u
. "$(dirname "$0")/leak-scan-patterns.sh"

if ! command -v betterleaks >/dev/null 2>&1; then
  printf 'leak-scan: betterleaks is not installed; run: brew install betterleaks\n' >&2
  exit 1
fi

status=0

betterleaks git . --pre-commit --staged --no-banner -v || status=1
report_staged_emails || status=1

exit "$status"

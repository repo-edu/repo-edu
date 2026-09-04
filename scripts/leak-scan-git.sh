#!/usr/bin/env sh
# Leak report over every commit: credentials in the history and every email address ever added.
# The rules are in leak-scan.md.
#
# A hit in history was pushed and is public, so this reports and always exits 0: the response is
# to revoke or rotate, not to edit the tree.

set -u
. "$(dirname "$0")/leak-scan-patterns.sh"

if ! command -v betterleaks >/dev/null 2>&1; then
  printf 'leak-scan-git: betterleaks is not installed; run: brew install betterleaks\n' >&2
  exit 1
fi

betterleaks git . --no-banner -v --exit-code 0

# Every added line of every commit, prefixed with its file path, through the same allow list.
# The report counts each address once per line it was added on, sorted by domain.
addresses=$(git log --all -p --no-color --format= \
  | awk '/^\+\+\+ b\//{path=substr($0,7);next} /^\+/{print path ":" substr($0,2)}' \
  | grep -E "$EMAIL_PATTERN" | grep -v -E "$EMAIL_ALLOW" \
  | grep -o -E "$EMAIL_PATTERN" | sort | uniq -c | sort -t@ -k2,2 -k1,1 \
  || true)
if [ -n "$addresses" ]; then
  printf '%s\n' "$addresses"
  printf 'leak-scan-git: %s email addresses outside the allow list were added in history\n' \
    "$(printf '%s\n' "$addresses" | wc -l | tr -d ' ')"
else
  printf 'leak-scan-git: no email address outside the allow list in history\n'
fi

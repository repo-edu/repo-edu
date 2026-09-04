#!/usr/bin/env sh
# Leak scan before a commit. The rules are in leak-scan.md.

set -u

if ! command -v betterleaks >/dev/null 2>&1; then
  printf 'leak-scan: betterleaks is not installed; run: brew install betterleaks\n' >&2
  exit 1
fi

status=0

# Credential patterns in the staged changes.
betterleaks git . --pre-commit --staged --no-banner || status=1

# Email addresses in the whole staged tree, minus the allow list.
hits=$(git grep --cached -n -I -E '[A-Za-z0-9._%+-]+@[A-Za-z][A-Za-z0-9.-]*\.[a-z]{2,}' \
  | grep -v -E 'd\.a\.v\.beek@tue\.nl|opensource@repo-edu\.dev|@([A-Za-z0-9-]+\.)*example\.(com|org|net)\b|@[A-Za-z0-9.-]+\.(test|invalid|local)\b|^[^:]*/licenses/[^:]*:|^pnpm-lock\.yaml:|x-access-token:token(-[0-9]+)?@' \
  || true)
if [ -n "$hits" ]; then
  printf '%s\n' "$hits"
  printf 'leak-scan: email address outside the allow list\n' >&2
  status=1
fi

exit "$status"

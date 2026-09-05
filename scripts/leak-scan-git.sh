#!/usr/bin/env sh
# Leak report over every commit on every branch: credentials and email addresses.
# The rules are in leak-scan.md.
#
# A hit in history was pushed and is public, so findings exit 0: the response is
# to revoke or rotate, not to edit the tree.
#
# The report template prints one line per hit. The verbose output the hook uses
# would repeat the whole commit record, message included, for every hit.

set -u

if ! command -v betterleaks >/dev/null 2>&1; then
  printf 'leak-scan-git: betterleaks is not installed; run: brew install betterleaks\n' >&2
  exit 1
fi

betterleaks git . --no-banner --log-opts=--all --exit-code 0 \
  --report-format template --report-template "$(dirname "$0")/leak-scan-git.tmpl" --report-path -

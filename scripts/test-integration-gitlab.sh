#!/usr/bin/env sh

set -eu

cleanup() {
  pnpm --filter @repo-edu/integration-tests run docker:down || true
}
trap cleanup EXIT INT TERM

pnpm --filter @repo-edu/integration-tests run docker:up:gitlab || exit $?

status=0
sh ./scripts/test-integration-gitlab-run.sh || status=$?
exit "${status}"

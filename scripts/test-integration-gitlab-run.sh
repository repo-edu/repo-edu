#!/usr/bin/env sh

set -eu

GITLAB_PORT="${GITLAB_PORT:-8929}"
HEARTBEAT_SEC="${INTEGRATION_TEST_HEARTBEAT_SEC:-10}"
INTERVAL=5

echo "Heartbeat: test phase start providers=gitlab"

(
  INTEGRATION_GIT_PROVIDERS=gitlab \
  INTEGRATION_GITLAB_URL="${INTEGRATION_GITLAB_URL:-http://localhost:${GITLAB_PORT}}" \
  INTEGRATION_GITLAB_TOKEN="${INTEGRATION_GITLAB_TOKEN:-integration-root-token}" \
  INTEGRATION_GITLAB_PARENT_GROUP="${INTEGRATION_GITLAB_PARENT_GROUP:-integration-root}" \
  pnpm --filter @repo-edu/integration-tests run test:integration
) &
TEST_PID=$!

ELAPSED=0
while kill -0 "${TEST_PID}" 2>/dev/null; do
  if [ $((ELAPSED % HEARTBEAT_SEC)) -eq 0 ]; then
    echo "Heartbeat: running-integration-tests elapsed=${ELAPSED}s providers=gitlab"
  fi

  sleep "${INTERVAL}"
  ELAPSED=$((ELAPSED + INTERVAL))
done

status=0
wait "${TEST_PID}" || status=$?

if [ "${status}" -eq 0 ]; then
  echo "Heartbeat: integration-tests complete elapsed=${ELAPSED}s providers=gitlab"
fi

exit "${status}"

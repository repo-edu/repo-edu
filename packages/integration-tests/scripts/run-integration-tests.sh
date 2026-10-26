#!/usr/bin/env sh

set -eu

TMP_ROOT="${TMPDIR:-${HOME}/.repo-edu/tmp}"
mkdir -p "${TMP_ROOT}"
export TMPDIR="${TMP_ROOT}"

if [ "${INTEGRATION_GIT_PROVIDERS:-gitea}" = "github" ]; then
  GITHUB_RUN_RECORD_DIR="${HOME}/.repo-edu/github-live-run"
  GITHUB_RUN_RECORD="${GITHUB_RUN_RECORD_DIR}/started-at"
  GITHUB_CONTENT_WINDOW_SECONDS=3600
  GITHUB_RUN_STARTED_AT="$(date +%s)"

  mkdir -p "${GITHUB_RUN_RECORD_DIR}"
  if [ -f "${GITHUB_RUN_RECORD}" ]; then
    GITHUB_LAST_RUN_STARTED_AT="$(cat "${GITHUB_RUN_RECORD}")"
    case "${GITHUB_LAST_RUN_STARTED_AT}" in
      ''|*[!0-9]*)
        echo "Refusing GitHub live tests: the prior-run record is invalid." >&2
        exit 1
        ;;
    esac

    GITHUB_NEXT_RUN_AT=$((GITHUB_LAST_RUN_STARTED_AT + GITHUB_CONTENT_WINDOW_SECONDS))
    if [ "${GITHUB_RUN_STARTED_AT}" -lt "${GITHUB_NEXT_RUN_AT}" ]; then
      echo "Refusing GitHub live tests: one content-creation run is allowed per hour." >&2
      exit 1
    fi
  fi

  umask 077
  printf '%s\n' "${GITHUB_RUN_STARTED_AT}" > "${GITHUB_RUN_RECORD}"
fi

node --import tsx --test --test-concurrency=1 \
  src/create-clone-operations.test.ts \
  src/update-username-operations.test.ts \
  src/repo-create.test.ts \
  src/repo-clone.test.ts \
  src/repo-discover.test.ts

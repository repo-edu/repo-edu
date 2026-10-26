#!/usr/bin/env sh

set -eu

TMP_ROOT="${TMPDIR:-${HOME}/.repo-edu/tmp}"
mkdir -p "${TMP_ROOT}"
export TMPDIR="${TMP_ROOT}"

node --import tsx --test --test-isolation=none \
  src/create-clone-operations.test.ts \
  src/update-username-operations.test.ts \
  src/repo-create.test.ts \
  src/repo-clone.test.ts \
  src/repo-discover.test.ts

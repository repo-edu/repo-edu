#!/usr/bin/env sh

set -eu

TMP_ROOT="${TMPDIR:-${HOME}/.repo-edu/tmp}"
mkdir -p "${TMP_ROOT}"
export TMPDIR="${TMP_ROOT}"

node --import tsx --test src/repo-create.test.ts src/repo-clone.test.ts

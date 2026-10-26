#!/usr/bin/env sh

set -eu

TMP_ROOT="${TMPDIR:-${HOME}/.repo-edu/tmp}"
mkdir -p "${TMP_ROOT}"
export TMPDIR="${TMP_ROOT}"

node --import tsx src/live-run.ts

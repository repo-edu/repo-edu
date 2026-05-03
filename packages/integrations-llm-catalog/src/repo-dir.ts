import { getSpecByCode } from "./catalog"
import type { FixtureModelSpec } from "./types"

// Repo dir names look like:
//   m22-o1          (legacy — no version tag)
//   m22-46-o1       (versioned — sonnet 4.6, comments tier 1)
//   mc34-47-o2      (Codex / coder-prefixed — version 4.7, comments tier 2)
// Codes are alphanumeric (`22`, `c34`, etc.) and the version tag is
// `[a-z0-9]+`. The `o<digit>` suffix encodes the comments tier.
const REPO_DIR_RE = /^m([a-z]*\d+)(?:-([a-z0-9]+))?-o\d+/

export type RepoDirParse = {
  spec: FixtureModelSpec
  versionTag: string | undefined
}

export function parseRepoDirCode(dirName: string): RepoDirParse | null {
  const match = dirName.match(REPO_DIR_RE)
  if (!match) return null
  const [, code, versionTag] = match
  const spec = getSpecByCode(code)
  if (!spec) return null
  return { spec, versionTag }
}

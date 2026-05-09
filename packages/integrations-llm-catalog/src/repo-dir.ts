import { getSpecByCode } from "./catalog"
import type { FixtureModelSpec } from "./types"

// Repo dir names look like:
//   m22-o1                 (sonnet medium, comments tier 1)
//   mc542-o2               (Codex / coder-prefixed, comments 2)
//   m22-r31-o2             (coder + reviewer)
// Codes are alphanumeric (`22`, `c542`, `c54m`, etc.). An optional
// `r<code>` segment encodes the reviewer (review-round) model when it
// is recorded. The `o<digit>` suffix encodes the comments tier.
const REPO_DIR_RE = /^m([a-z]*\d+[a-z]*)(?:-r([a-z]*\d+[a-z]*))?-o\d+/

export type RepoDirParse = {
  spec: FixtureModelSpec
  reviewerSpec: FixtureModelSpec | undefined
}

export function parseRepoDirCode(dirName: string): RepoDirParse | null {
  const match = dirName.match(REPO_DIR_RE)
  if (!match) return null
  const [, code, reviewerCode] = match
  const spec = getSpecByCode(code)
  if (!spec) return null
  const reviewerSpec = reviewerCode
    ? (getSpecByCode(reviewerCode) ?? undefined)
    : undefined
  return { spec, reviewerSpec }
}

import { getSpecByCode } from "./catalog"
import type { FixtureModelSpec } from "./types"

// Repo dir names look like:
//   m22-o1                 (legacy — no version tag)
//   m22-46-o1              (versioned — sonnet 4.6, comments tier 1)
//   mc542-54-o2            (Codex / coder-prefixed — version 5.4, comments 2)
//   m22-46-r31-46-o2       (versioned coder + versioned reviewer)
//   m22-r31-o2             (legacy coder + legacy reviewer)
// Codes are alphanumeric (`22`, `c542`, `c54m`, etc.); version tags start with
// a digit (`\d[a-z0-9]*`) so the `r<code>` reviewer prefix is never
// mistaken for a version tag. An optional `r<code>(-<version>)?`
// segment encodes the reviewer (review-round) model when it is
// recorded. The `o<digit>` suffix encodes the comments tier.
const REPO_DIR_RE =
  /^m([a-z]*\d+[a-z]*)(?:-(\d[a-z0-9]*))?(?:-r([a-z]*\d+[a-z]*)(?:-(\d[a-z0-9]*))?)?-o\d+/

export type RepoDirParse = {
  spec: FixtureModelSpec
  versionTag: string | undefined
  reviewerSpec: FixtureModelSpec | undefined
  reviewerVersionTag: string | undefined
}

export function parseRepoDirCode(dirName: string): RepoDirParse | null {
  const match = dirName.match(REPO_DIR_RE)
  if (!match) return null
  const [, code, versionTag, reviewerCode, reviewerVersionTag] = match
  const spec = getSpecByCode(code)
  if (!spec) return null
  const reviewerSpec = reviewerCode
    ? (getSpecByCode(reviewerCode) ?? undefined)
    : undefined
  return { spec, versionTag, reviewerSpec, reviewerVersionTag }
}

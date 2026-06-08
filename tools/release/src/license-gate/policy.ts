import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const satisfiesSpdx = require("spdx-satisfies") as (
  expression: string,
  allowed: string[],
) => boolean
const parseSpdxExpression = require("spdx-expression-parse") as (
  expression: string,
) => SpdxExpressionNode

export type ClassificationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

type SpdxExpressionNode =
  | { readonly license: string; readonly exception?: string }
  | {
      readonly conjunction: "and" | "or"
      readonly left: SpdxExpressionNode
      readonly right: SpdxExpressionNode
    }

const acceptableSpdxLicenseIds = [
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "ISC",
  "LGPL-2.1-only",
  "LGPL-2.1-or-later",
  "LGPL-3.0-only",
  "LGPL-3.0-or-later",
  "MIT",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
] as const

const acceptableExactSpdxExpressions = new Set([
  "BSD-3-Clause WITH PCRE2-exception",
])

const unacceptableTextPatterns = [
  /^UNLICENSED$/i,
  /^SEE LICEN[CS]E/i,
  /^unknown$/i,
  /all rights reserved/i,
  /source[- ]available/i,
  /proprietary/i,
] as const

export function classifyLicenseExpression(
  expression: string,
): ClassificationResult {
  const normalized = expression.trim()
  if (
    normalized.length === 0 ||
    unacceptableTextPatterns.some((pattern) => pattern.test(normalized))
  ) {
    return {
      ok: false,
      reason: `unknown or non-redistributable license string "${expression}"`,
    }
  }
  if (acceptableExactSpdxExpressions.has(normalized)) {
    return { ok: true }
  }

  let ids: string[]
  try {
    ids = collectSpdxIds(parseSpdxExpression(normalized))
  } catch {
    return {
      ok: false,
      reason: `invalid SPDX license expression "${expression}"`,
    }
  }

  try {
    if (satisfiesSpdx(normalized, [...acceptableSpdxLicenseIds])) {
      return { ok: true }
    }
  } catch {
    return {
      ok: false,
      reason: `invalid SPDX license expression "${expression}"`,
    }
  }

  const acceptable = new Set<string>(acceptableSpdxLicenseIds)
  const unacceptableIds = [...new Set(ids.filter((id) => !acceptable.has(id)))]
  return {
    ok: false,
    reason:
      unacceptableIds.length > 0
        ? `unacceptable license id(s): ${unacceptableIds.join(", ")}`
        : `SPDX expression "${expression}" does not satisfy the release allow-list`,
  }
}

function collectSpdxIds(node: SpdxExpressionNode): string[] {
  if ("license" in node) {
    return [node.license]
  }
  return [...collectSpdxIds(node.left), ...collectSpdxIds(node.right)]
}

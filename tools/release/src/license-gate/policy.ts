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

type BlueOakList = readonly {
  readonly licenses: readonly { readonly id: string }[]
}[]

type BlueOakCopyleft = Record<
  string,
  readonly { readonly id: string; readonly name?: string }[]
>

type SpdxExpressionNode =
  | { readonly license: string; readonly exception?: string }
  | {
      readonly conjunction: "and" | "or"
      readonly left: SpdxExpressionNode
      readonly right: SpdxExpressionNode
    }

export function classifyLicenseExpression(
  expression: string,
): ClassificationResult {
  const normalized = expression.trim()
  if (
    normalized.length === 0 ||
    /^UNLICENSED$/i.test(normalized) ||
    /^SEE LICEN[CS]E/i.test(normalized) ||
    /all rights reserved/i.test(normalized) ||
    /source[- ]available/i.test(normalized) ||
    /^unknown$/i.test(normalized)
  ) {
    return {
      ok: false,
      reason: `non-SPDX or non-redistributable license string "${expression}"`,
    }
  }

  const allowlist = blueOakAllowlist()
  const allowlistIds = [...allowlist]

  try {
    if (satisfiesSpdx(normalized, allowlistIds)) {
      return { ok: true }
    }
  } catch {
    return {
      ok: false,
      reason: `invalid SPDX license expression "${expression}"`,
    }
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

  const denylist = blueOakCopyleftIds()
  const copyleftIds = ids.filter((id) => denylist.has(id))
  if (copyleftIds.length > 0) {
    return {
      ok: false,
      reason: `copyleft license id(s): ${copyleftIds.join(", ")}`,
    }
  }

  const unknownIds = ids.filter((id) => !allowlist.has(id) && !denylist.has(id))
  if (unknownIds.length > 0) {
    return {
      ok: false,
      reason: `license id(s) absent from Blue Oak allow/deny datasets: ${unknownIds.join(", ")}`,
    }
  }

  return {
    ok: false,
    reason: `SPDX expression "${expression}" does not satisfy the permissive allowlist`,
  }
}

function collectSpdxIds(node: SpdxExpressionNode): string[] {
  if ("license" in node) {
    return [node.license]
  }
  return [...collectSpdxIds(node.left), ...collectSpdxIds(node.right)]
}

function blueOakAllowlist(): Set<string> {
  const data = require("@blueoak/list/index.json") as BlueOakList
  return new Set(
    data.flatMap((rating) => rating.licenses.map((license) => license.id)),
  )
}

function blueOakCopyleftIds(): Set<string> {
  const data = require("@blueoak/copyleft/index.json") as BlueOakCopyleft
  return new Set(
    Object.values(data).flatMap((licenses) =>
      licenses.map((license) => license.id),
    ),
  )
}

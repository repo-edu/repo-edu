import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const spdxLicenses = require("spdx-license-list/full") as Record<
  string,
  { readonly licenseText?: string }
>
const parseSpdxExpression = require("spdx-expression-parse") as (
  expression: string,
) => SpdxExpressionNode

type SpdxExpressionNode =
  | { readonly license: string; readonly exception?: string }
  | {
      readonly conjunction: "and" | "or"
      readonly left: SpdxExpressionNode
      readonly right: SpdxExpressionNode
    }

export function licenseTextForSpdxId(id: string): string {
  const text = spdxLicenses[id]?.licenseText
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error(`No SPDX license text is available for ${id}.`)
  }
  return text
}

export function licenseTextForSpdxExpression(expression: string): string {
  const ids = [...new Set(collectSpdxIds(parseSpdxExpression(expression)))]
  return ids
    .map((id) => `SPDX License: ${id}\n\n${licenseTextForSpdxId(id)}`)
    .join("\n\n")
}

function collectSpdxIds(node: SpdxExpressionNode): string[] {
  if ("license" in node) {
    return [node.license]
  }
  return [...collectSpdxIds(node.left), ...collectSpdxIds(node.right)]
}

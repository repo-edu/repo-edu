import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const spdxLicenses = require("spdx-license-list/full") as Record<
  string,
  { readonly licenseText?: string }
>

export function licenseTextForSpdxId(id: string): string {
  const text = spdxLicenses[id]?.licenseText
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error(`No SPDX license text is available for ${id}.`)
  }
  return text
}

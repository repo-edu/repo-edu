/**
 * Browser-safe path utilities.
 *
 * These replace `node:path` so the application package stays browser-safe
 * (required by the docs demo harness).
 */

export function isAbsolutePath(value: string): boolean {
  return (
    value.startsWith("/") ||
    /^[a-zA-Z]:[\\/]/.test(value) ||
    value.startsWith("\\\\")
  )
}

export function joinPath(base: string, segment: string): string {
  const separator = base.includes("\\") && !base.includes("/") ? "\\" : "/"
  const normalizedBase = base.replace(/[\\/]+$/g, "")
  const normalizedSegment = segment.replace(/^[\\/]+/g, "")
  if (normalizedBase === "") {
    return normalizedSegment
  }
  return `${normalizedBase}${separator}${normalizedSegment}`
}

export function basename(value: string): string {
  const normalized = value.replace(/[\\/]+$/g, "")
  const lastSep = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  )
  return lastSep === -1 ? normalized : normalized.slice(lastSep + 1)
}

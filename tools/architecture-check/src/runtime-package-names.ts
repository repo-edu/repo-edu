import { builtinModules } from "node:module"

const NODE_RUNTIME_NAMES = new Set(builtinModules)
const PROTOCOL_PATTERN = /^[A-Za-z][A-Za-z\d+.-]*:/

export function isRuntimeProtocolName(fullName: string): boolean {
  return PROTOCOL_PATTERN.test(fullName)
}

export function isRelativeModuleName(fullName: string): boolean {
  return fullName.startsWith("./") || fullName.startsWith("../")
}

export function packageRootForBareLoad(fullName: string): string | null {
  if (
    fullName.length === 0 ||
    fullName.startsWith("/") ||
    fullName.startsWith("#") ||
    isRelativeModuleName(fullName) ||
    isRuntimeProtocolName(fullName)
  ) {
    return null
  }

  const parts = fullName.split("/")
  if (fullName.startsWith("@")) {
    if (
      parts.length < 2 ||
      parts[0]?.length === 1 ||
      !parts[1] ||
      parts.slice(2).some((part) => part.length === 0)
    ) {
      return null
    }
    return `${parts[0]}/${parts[1]}`
  }

  if (!parts[0] || parts.some((part) => part.length === 0)) {
    return null
  }
  return parts[0]
}

export function requirePackageRoot(fullName: string): string {
  const root = packageRootForBareLoad(fullName)
  if (!root) {
    throw new Error(`"${fullName}" is not a bare package load name.`)
  }
  return root
}

export function isRuntimeSuppliedLoadName(fullName: string): boolean {
  return (
    fullName.startsWith("node:") ||
    fullName.startsWith("bun:") ||
    fullName === "electron" ||
    fullName.startsWith("electron/") ||
    NODE_RUNTIME_NAMES.has(fullName)
  )
}

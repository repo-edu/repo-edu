import * as fs from "node:fs"
import * as path from "node:path"
import { MoveInputError } from "./input-error.js"

const SCRIPT_SEPARATORS = new Set(["&&", "||", ";", "|"])

/**
 * Finds the TypeScript configuration that the source file's package checks
 * with: the `tsc -p` argument of the nearest package's `typecheck` script.
 * That configuration holds the package's own tests, so a move repoints them
 * and the diagnostic comparison covers them. The nearest `tsconfig.json`
 * excludes them, so there is no fallback to it.
 */
export function findTypecheckConfig(root: string, sourcePath: string): string {
  const packageDir = findPackageDir(root, sourcePath)
  const packageLabel = path.relative(root, packageDir)
  const manifest = JSON.parse(
    fs.readFileSync(path.join(packageDir, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> }
  const script = manifest.scripts?.typecheck
  if (script === undefined) {
    throw new MoveInputError(`${packageLabel} has no typecheck script`)
  }
  const projectArgument = tscProjectArgument(script)
  if (projectArgument === undefined) {
    throw new MoveInputError(
      `${packageLabel}: its typecheck script "${script}" names no tsc -p configuration`,
    )
  }
  const configPath = path.resolve(packageDir, projectArgument)
  const resolved =
    fs.existsSync(configPath) && fs.statSync(configPath).isDirectory()
      ? path.join(configPath, "tsconfig.json")
      : configPath
  if (!fs.existsSync(resolved)) {
    throw new MoveInputError(
      `${packageLabel}: typecheck configuration ${path.relative(root, resolved)} does not exist`,
    )
  }
  return resolved
}

function findPackageDir(root: string, sourcePath: string): string {
  let dir = path.dirname(sourcePath)
  while (dir !== root && dir.startsWith(`${root}${path.sep}`)) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir
    }
    dir = path.dirname(dir)
  }
  throw new MoveInputError(
    `${path.relative(root, sourcePath)} is in no workspace package`,
  )
}

function tscProjectArgument(script: string): string | undefined {
  const tokens = script.trim().split(/\s+/)
  const tscIndex = tokens.indexOf("tsc")
  if (tscIndex === -1) {
    return undefined
  }
  for (let index = tscIndex + 1; index < tokens.length - 1; index++) {
    const token = tokens[index]
    if (SCRIPT_SEPARATORS.has(token)) {
      return undefined
    }
    if (token === "-p" || token === "--project") {
      return tokens[index + 1]
    }
  }
  return undefined
}

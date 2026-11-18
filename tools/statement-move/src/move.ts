import * as fs from "node:fs"
import * as path from "node:path"
import { MoveInputError } from "./input-error.js"
import { type MoveCandidate, prepareMove } from "./move-service.js"
import { findTypecheckConfig } from "./typecheck-config.js"

const TYPESCRIPT_SOURCE = /\.(ts|tsx|mts|cts)$/
const DECLARATION_FILE = /\.d\.(ts|mts|cts)$/

export interface MoveCommand {
  readonly root: string
  readonly source: string
  readonly startLine: number
  readonly endLine: number
  readonly target: string
}

/**
 * Moves the selected top-level statements of one workspace file into the
 * target. The complete candidate edit set is written only when it adds no
 * TypeScript 6 project diagnostic; a refused candidate writes nothing.
 */
export function moveStatements(command: MoveCommand): MoveCandidate {
  // Module resolution follows real paths, so every path the service sees is
  // real too; a symlinked root would otherwise load each file twice.
  const root = fs.realpathSync(command.root)
  const sourcePath = workspacePath(root, command.source, "source")
  const targetPath = workspacePath(root, command.target, "target")
  if (!fs.existsSync(sourcePath)) {
    throw new MoveInputError(`source ${command.source} does not exist`)
  }
  if (sourcePath === targetPath) {
    throw new MoveInputError("source and target are the same file")
  }
  const candidate = prepareMove({
    root,
    configPath: findTypecheckConfig(root, sourcePath),
    sourcePath,
    startLine: command.startLine,
    endLine: command.endLine,
    targetPath,
  })
  if (candidate.kind === "accepted") {
    for (const file of candidate.files) {
      fs.mkdirSync(path.dirname(file.path), { recursive: true })
      fs.writeFileSync(file.path, file.text)
    }
  }
  return candidate
}

function workspacePath(root: string, given: string, role: string): string {
  const resolved = path.resolve(root, given)
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new MoveInputError(`${role} ${given} is outside the workspace`)
  }
  if (!TYPESCRIPT_SOURCE.test(resolved) || DECLARATION_FILE.test(resolved)) {
    throw new MoveInputError(`${role} ${given} is not a TypeScript source file`)
  }
  return resolved
}

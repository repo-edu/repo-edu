import * as fs from "node:fs"
import * as path from "node:path"
import type { ReportedDiagnostic } from "./diagnostics.js"
import { MoveInputError } from "./input-error.js"
import {
  type CandidateFile,
  type ImportEnding,
  type MoveRecord,
  prepareMoves,
} from "./move-service.js"
import type { SelectedStatement } from "./statement-selection.js"
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

interface CandidateBase {
  readonly statements: readonly SelectedStatement[]
  readonly importEnding: ImportEnding
  readonly fixes: readonly string[]
}

/** What one command move did, as the command prints it. */
export type MoveCandidate =
  | (CandidateBase & {
      readonly kind: "accepted"
      readonly files: readonly CandidateFile[]
    })
  | (CandidateBase & {
      readonly kind: "refused"
      readonly diagnostics: readonly ReportedDiagnostic[]
    })

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
  if (!fs.existsSync(sourcePath)) {
    throw new MoveInputError(`source ${command.source} does not exist`)
  }
  const candidate = prepareMoves({
    root,
    configPath: findTypecheckConfig(root, sourcePath),
    sourcePath,
    moves: [
      {
        targetPath: targetPath(root, sourcePath, command.target),
        startLine: command.startLine,
        endLine: command.endLine,
      },
    ],
  })
  const base = (move: MoveRecord): CandidateBase => ({
    statements: move.statements,
    importEnding: candidate.importEnding,
    fixes: move.fixes,
  })
  if (candidate.kind === "refused") {
    const { refusal } = candidate
    if (refusal.kind === "input") {
      throw new MoveInputError(refusal.message)
    }
    return {
      ...base(candidate.moves[0]),
      kind: "refused",
      diagnostics: refusal.diagnostics,
    }
  }
  for (const file of candidate.files) {
    fs.mkdirSync(path.dirname(file.path), { recursive: true })
    fs.writeFileSync(file.path, file.text)
  }
  return {
    ...base(candidate.moves[0]),
    kind: "accepted",
    files: candidate.files,
  }
}

/** Resolves a workspace-relative TypeScript source path under the real root. */
export function workspacePath(
  root: string,
  given: string,
  role: string,
): string {
  const resolved = path.resolve(root, given)
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new MoveInputError(`${role} ${given} is outside the workspace`)
  }
  if (!TYPESCRIPT_SOURCE.test(resolved) || DECLARATION_FILE.test(resolved)) {
    throw new MoveInputError(`${role} ${given} is not a TypeScript source file`)
  }
  return resolved
}

/** Resolves a target path, which may not name the source itself. */
export function targetPath(
  root: string,
  sourcePath: string,
  given: string,
): string {
  const resolved = workspacePath(root, given, "target")
  if (resolved === sourcePath) {
    throw new MoveInputError("source and target are the same file")
  }
  return resolved
}

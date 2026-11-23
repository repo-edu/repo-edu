import ts from "typescript"

/**
 * The project diagnostics a move is judged by, read from a program and
 * compared by key, so a candidate is refused when it adds any.
 */

export interface KeyedDiagnostic {
  readonly key: string
  readonly diagnostic: ts.Diagnostic
}

export interface ReportedDiagnostic {
  readonly path: string | undefined
  readonly line: number | undefined
  readonly column: number | undefined
  readonly code: number
  readonly message: string
}

export function projectDiagnostics(program: ts.Program): KeyedDiagnostic[] {
  const global = [
    ...program.getOptionsDiagnostics(),
    ...program.getGlobalDiagnostics(),
  ].map(keyed)
  const files = program
    .getSourceFiles()
    .filter(
      (file) =>
        !file.isDeclarationFile &&
        !program.isSourceFileFromExternalLibrary(file),
    )
    .flatMap((file) => fileDiagnostics(program, file))
  return [...global, ...files]
}

export function fileDiagnostics(
  program: ts.Program,
  file: ts.SourceFile,
): KeyedDiagnostic[] {
  return [
    ...program.getSyntacticDiagnostics(file),
    ...program.getSemanticDiagnostics(file),
  ].map(keyed)
}

// Positions shift when code moves, so a diagnostic is identified by its file,
// code and message. A count per key lets a repeated message count once per
// occurrence.
function keyed(diagnostic: ts.Diagnostic): KeyedDiagnostic {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  return {
    key: `${diagnostic.file?.fileName ?? ""}\u0000${diagnostic.code}\u0000${message}`,
    diagnostic,
  }
}

export function countKeys(
  diagnostics: readonly KeyedDiagnostic[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const { key } of diagnostics) {
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

export function introduced(
  before: ReadonlyMap<string, number>,
  after: readonly KeyedDiagnostic[],
): KeyedDiagnostic[] {
  const remaining = new Map(before)
  const result: KeyedDiagnostic[] = []
  for (const entry of after) {
    const left = remaining.get(entry.key) ?? 0
    if (left > 0) {
      remaining.set(entry.key, left - 1)
    } else {
      result.push(entry)
    }
  }
  return result
}

export function report(
  diagnostic: ts.Diagnostic,
  display: (fileName: string) => string,
): ReportedDiagnostic {
  const position =
    diagnostic.file !== undefined && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : undefined
  return {
    path:
      diagnostic.file === undefined
        ? undefined
        : display(diagnostic.file.fileName),
    line: position === undefined ? undefined : position.line + 1,
    column: position === undefined ? undefined : position.character + 1,
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  }
}

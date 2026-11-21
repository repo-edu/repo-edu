import * as path from "node:path"
import ts from "typescript"
import { MoveInputError } from "./input-error.js"

/**
 * The one owner of the TypeScript 6 language service. It loads the package's
 * typecheck configuration, serves saved files through `ts.sys` with candidate
 * text in an in-memory overlay, asks the engine for its Move to file edits,
 * applies the service's own import-kind fixes and compares project
 * diagnostics before and after. It writes no file.
 */

const MOVE_TO_FILE = "Move to file"
const MOVE_TO_FILE_KIND = "refactor.move.file"

// The engine can write the wrong import kind in either direction under
// verbatimModuleSyntax. Each code maps to the name of the service's own fix
// for it: 1361 (a value imported with `import type`) to the import fix that
// removes `type`, and 1484 (a type imported as a value) to
// `convertToTypeOnlyImport`, which marks the name with `type`. The first
// offered action of that name is applied.
const IMPORT_KIND_FIXES = new Map<number, string>([
  [1361, "import"],
  [1484, "convertToTypeOnlyImport"],
])

const FORMAT_SETTINGS: ts.FormatCodeSettings = {
  ...ts.getDefaultFormatCodeSettings("\n"),
  indentSize: 2,
  tabSize: 2,
  convertTabsToSpaces: true,
  semicolons: ts.SemicolonPreference.Remove,
}

export type ImportEnding = "js" | "minimal"

export interface MoveRequest {
  readonly root: string
  readonly configPath: string
  readonly sourcePath: string
  readonly startLine: number
  readonly endLine: number
  readonly targetPath: string
}

export interface SelectedStatement {
  readonly startLine: number
  readonly endLine: number
  readonly firstLine: string
}

export interface CandidateFile {
  readonly path: string
  readonly text: string
  readonly isNew: boolean
}

export interface ReportedDiagnostic {
  readonly path: string | undefined
  readonly line: number | undefined
  readonly column: number | undefined
  readonly code: number
  readonly message: string
}

interface CandidateBase {
  readonly statements: readonly SelectedStatement[]
  readonly importEnding: ImportEnding
  readonly fixes: readonly string[]
}

export type MoveCandidate =
  | (CandidateBase & {
      readonly kind: "accepted"
      readonly files: readonly CandidateFile[]
    })
  | (CandidateBase & {
      readonly kind: "refused"
      readonly diagnostics: readonly ReportedDiagnostic[]
    })

interface KeyedDiagnostic {
  readonly key: string
  readonly diagnostic: ts.Diagnostic
}

interface OverlayEntry {
  text: string
  version: number
  readonly isNew: boolean
}

export function prepareMove(request: MoveRequest): MoveCandidate {
  const parsed = loadConfiguration(request)
  const overlay = new Map<string, OverlayEntry>()
  const readFile = (fileName: string): string | undefined =>
    overlay.get(fileName)?.text ?? ts.sys.readFile(fileName)
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => parsed.options,
    getScriptFileNames: () => [
      ...parsed.fileNames,
      ...[...overlay.keys()].filter(
        (fileName) => !parsed.fileNames.includes(fileName),
      ),
    ],
    getScriptVersion: (fileName) => String(overlay.get(fileName)?.version ?? 0),
    getScriptSnapshot: (fileName) => {
      const text = readFile(fileName)
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
    },
    getCurrentDirectory: () => path.dirname(request.configPath),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (fileName) =>
      overlay.has(fileName) || ts.sys.fileExists(fileName),
    readFile,
    readDirectory: ts.sys.readDirectory,
    // A new target may sit in a folder that only the overlay holds. Module
    // resolution checks an import's folder before the file, so without this a
    // file that still imports the moved code gets a false missing-module error.
    directoryExists: (directoryName) =>
      ts.sys.directoryExists(directoryName) ||
      overlayHoldsDirectory(overlay, directoryName),
    getDirectories: ts.sys.getDirectories,
    // pnpm links one package into several node_modules folders. Without real
    // paths the service loads it twice and reports errors between the copies.
    realpath: ts.sys.realpath,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  }
  const service = ts.createLanguageService(host, ts.createDocumentRegistry())
  const display = (fileName: string) => path.relative(request.root, fileName)

  const program = requireProgram(service)
  const sourceFile = program.getSourceFile(request.sourcePath)
  if (sourceFile === undefined) {
    throw new MoveInputError(
      `${display(request.sourcePath)} is not part of ${display(request.configPath)}`,
    )
  }
  const selection = selectStatements(
    sourceFile,
    program.getTypeChecker(),
    request,
    display,
  )
  const importEnding = sourceImportEnding(sourceFile)
  const preferences: ts.UserPreferences = {
    allowTextChangesInNewFiles: true,
    provideRefactorNotApplicableReason: true,
    importModuleSpecifierEnding: importEnding,
  }
  const before = countKeys(projectDiagnostics(program))

  const offered = service
    .getApplicableRefactors(
      request.sourcePath,
      selection.range,
      preferences,
      "invoked",
      MOVE_TO_FILE_KIND,
      true,
    )
    .flatMap((refactor) => refactor.actions)
    .find((action) => action.name === MOVE_TO_FILE)
  if (offered === undefined || offered.notApplicableReason !== undefined) {
    throw new MoveInputError(
      `the language service offers no Move to file for these statements${
        offered?.notApplicableReason ? `: ${offered.notApplicableReason}` : ""
      }`,
    )
  }
  const edits = service.getEditsForRefactor(
    request.sourcePath,
    FORMAT_SETTINGS,
    selection.range,
    MOVE_TO_FILE,
    MOVE_TO_FILE,
    preferences,
    // The refactor keeps this spelling for a new file. Its later reads use
    // forward slashes, so the overlay must receive the same path on Windows.
    { targetFile: request.targetPath.replaceAll(path.sep, "/") },
  )
  if (edits?.notApplicableReason !== undefined) {
    throw new MoveInputError(
      `the language service declined the move: ${edits.notApplicableReason}`,
    )
  }
  if (edits === undefined || edits.edits.length === 0) {
    throw new MoveInputError("the language service returned no edits")
  }

  const applyFileChanges = (changes: readonly ts.FileTextChanges[]) => {
    for (const change of changes) {
      const current = overlay.get(change.fileName)
      const base =
        current?.text ??
        (change.isNewFile ? "" : (ts.sys.readFile(change.fileName) ?? ""))
      overlay.set(change.fileName, {
        text: applyTextChanges(base, change.textChanges),
        version: (current?.version ?? 0) + 1,
        isNew: current?.isNew ?? change.isNewFile === true,
      })
    }
  }
  applyFileChanges(edits.edits)

  const fixes: string[] = []
  const attempted = new Set<string>()
  for (;;) {
    const changedProgram = requireProgram(service)
    const changedDiagnostics = [...overlay.keys()].flatMap((fileName) => {
      const file = changedProgram.getSourceFile(fileName)
      return file === undefined ? [] : fileDiagnostics(changedProgram, file)
    })
    const next = introduced(before, changedDiagnostics).find(
      ({ key, diagnostic }) =>
        IMPORT_KIND_FIXES.has(diagnostic.code) && !attempted.has(key),
    )
    if (next === undefined) {
      break
    }
    attempted.add(next.key)
    const { diagnostic } = next
    const start = diagnostic.start ?? 0
    const fixName = IMPORT_KIND_FIXES.get(diagnostic.code)
    const fix = service
      .getCodeFixesAtPosition(
        diagnostic.file?.fileName ?? request.sourcePath,
        start,
        start + (diagnostic.length ?? 0),
        [diagnostic.code],
        FORMAT_SETTINGS,
        preferences,
      )
      .find((action) => action.fixName === fixName)
    if (fix === undefined) {
      continue
    }
    applyFileChanges(fix.changes)
    fixes.push(
      `${fix.description} in ${display(diagnostic.file?.fileName ?? "")}`,
    )
  }

  const added = introduced(before, projectDiagnostics(requireProgram(service)))
  const base = { statements: selection.statements, importEnding, fixes }
  if (added.length > 0) {
    return {
      ...base,
      kind: "refused",
      diagnostics: added.map(({ diagnostic }) => report(diagnostic, display)),
    }
  }
  return {
    ...base,
    kind: "accepted",
    files: [...overlay.entries()].map(([fileName, entry]) => ({
      path: fileName,
      text: entry.text,
      isNew: entry.isNew,
    })),
  }
}

function loadConfiguration(request: MoveRequest): ts.ParsedCommandLine {
  let unrecoverable: string | undefined
  const parsed = ts.getParsedCommandLineOfConfigFile(
    request.configPath,
    undefined,
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        unrecoverable = ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          "\n",
        )
      },
    },
  )
  if (parsed === undefined || unrecoverable !== undefined) {
    throw new MoveInputError(
      `cannot load ${path.relative(request.root, request.configPath)}: ${unrecoverable ?? "unknown error"}`,
    )
  }
  return parsed
}

function overlayHoldsDirectory(
  overlay: ReadonlyMap<string, OverlayEntry>,
  directoryName: string,
): boolean {
  const prefix = `${path.resolve(directoryName)}${path.sep}`
  return [...overlay.keys()].some((fileName) =>
    path.resolve(fileName).startsWith(prefix),
  )
}

function requireProgram(service: ts.LanguageService): ts.Program {
  const program = service.getProgram()
  if (program === undefined) {
    throw new Error("the language service produced no program")
  }
  return program
}

function selectStatements(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  request: MoveRequest,
  display: (fileName: string) => string,
): { statements: SelectedStatement[]; range: ts.TextRange } {
  const lineStarts = sourceFile.getLineStarts()
  const { startLine, endLine } = request
  if (startLine < 1 || endLine < startLine || endLine > lineStarts.length) {
    throw new MoveInputError(
      `lines ${startLine}-${endLine} are outside ${display(request.sourcePath)}, which has ${lineStarts.length} lines`,
    )
  }
  const rangeStart = lineStarts[startLine - 1]
  const rangeEnd =
    endLine < lineStarts.length ? lineStarts[endLine] : sourceFile.text.length
  const lineOf = (position: number) =>
    sourceFile.getLineAndCharacterOfPosition(position).line + 1
  const describe = (statement: ts.Statement) =>
    `lines ${lineOf(statement.getStart(sourceFile))}-${lineOf(statement.end)}`

  const selected = sourceFile.statements.filter(
    (statement) =>
      statement.getStart(sourceFile) < rangeEnd && statement.end > rangeStart,
  )
  if (selected.length === 0) {
    throw new MoveInputError(
      `lines ${startLine}-${endLine} hold no top-level statement`,
    )
  }
  for (const statement of selected) {
    if (
      statement.getStart(sourceFile) < rangeStart ||
      statement.end > rangeEnd
    ) {
      throw new MoveInputError(
        `lines ${startLine}-${endLine} cut the top-level statement at ${describe(statement)}`,
      )
    }
    if (
      ts.isImportDeclaration(statement) ||
      (ts.isImportEqualsDeclaration(statement) &&
        ts.isExternalModuleReference(statement.moduleReference))
    ) {
      throw new MoveInputError(
        `the import at ${describe(statement)} cannot be moved; imports follow the moved statements`,
      )
    }
    // The engine moves every declaration of an overloaded function together.
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      const declarations = new Set<ts.Node>(
        checker.getSymbolAtLocation(statement.name)?.declarations,
      )
      const outside = sourceFile.statements.find(
        (other) => declarations.has(other) && !selected.includes(other),
      )
      if (outside !== undefined) {
        throw new MoveInputError(
          `${statement.name.text} has a declaration at ${describe(outside)} outside lines ${startLine}-${endLine}; select all its declarations`,
        )
      }
    }
  }
  const first = selected[0]
  const last = selected[selected.length - 1]
  return {
    statements: selected.map((statement) => {
      const start = statement.getStart(sourceFile)
      const line = lineOf(start)
      const lineEnd =
        line < lineStarts.length ? lineStarts[line] : sourceFile.text.length
      return {
        startLine: line,
        endLine: lineOf(statement.end),
        firstLine: sourceFile.text
          .slice(lineStarts[line - 1], lineEnd)
          .trimEnd(),
      }
    }),
    range: { pos: first.getStart(sourceFile), end: last.end },
  }
}

/**
 * The first relative import that ends in `.js` or has no extension decides
 * the ending. Every other ending, such as `.json`, `.css` or a dotted name,
 * says nothing about how the file writes code imports and is skipped. A file
 * without a deciding import takes `.js`, the style of most of the workspace.
 * Without this preference a new target file gets no extension whatever its
 * package writes.
 */
function sourceImportEnding(sourceFile: ts.SourceFile): ImportEnding {
  for (const statement of sourceFile.statements) {
    if (
      (ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const specifier = statement.moduleSpecifier.text
      if (!(specifier.startsWith("./") || specifier.startsWith("../"))) {
        continue
      }
      const lastPart = specifier.slice(specifier.lastIndexOf("/") + 1)
      if (lastPart.endsWith(".js")) {
        return "js"
      }
      if (!lastPart.includes(".")) {
        return "minimal"
      }
    }
  }
  return "js"
}

function applyTextChanges(
  text: string,
  changes: readonly ts.TextChange[],
): string {
  // Changes arrive in ascending order. Applying them from the last to the
  // first keeps earlier offsets valid and keeps inserts at one position in
  // their given order.
  let result = text
  for (let index = changes.length - 1; index >= 0; index--) {
    const { span, newText } = changes[index]
    const next = changes[index + 1]
    if (next !== undefined && span.start + span.length > next.span.start) {
      throw new Error("the language service returned overlapping text changes")
    }
    result =
      result.slice(0, span.start) +
      newText +
      result.slice(span.start + span.length)
  }
  return result
}

function projectDiagnostics(program: ts.Program): KeyedDiagnostic[] {
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

function fileDiagnostics(
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

function countKeys(
  diagnostics: readonly KeyedDiagnostic[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const { key } of diagnostics) {
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function introduced(
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

function report(
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

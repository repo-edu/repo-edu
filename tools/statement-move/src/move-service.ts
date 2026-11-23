import * as path from "node:path"
import ts from "typescript"
import {
  countKeys,
  fileDiagnostics,
  introduced,
  type KeyedDiagnostic,
  projectDiagnostics,
  type ReportedDiagnostic,
  report,
} from "./diagnostics.js"
import { MoveInputError } from "./input-error.js"
import {
  describeLines,
  type SelectedStatement,
  selectedStatement,
  selectStatements,
} from "./statement-selection.js"

/**
 * The one owner of the TypeScript 6 language service. It loads the package's
 * typecheck configuration, serves saved files through `ts.sys` with candidate
 * text in an in-memory overlay, asks the engine for its Move to file edits,
 * applies the service's own import-kind fixes and compares project
 * diagnostics before and after each move. Every move of one request shares
 * the overlay, so a later move reads the text the earlier moves left. It
 * writes no file.
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

/** One engine move: a line range of the source and the file it goes to. */
export interface MoveRange {
  readonly targetPath: string
  /**
   * One-based and inclusive, in the lines of the source as it is saved before
   * the request's first move.
   */
  readonly startLine: number
  readonly endLine: number
}

export interface MovesRequest {
  readonly root: string
  readonly configPath: string
  readonly sourcePath: string
  /** Carried out in this order. */
  readonly moves: readonly MoveRange[]
}

export interface CandidateFile {
  readonly path: string
  readonly text: string
  readonly isNew: boolean
}

/** One move the engine carried out into the overlay. */
export interface MoveRecord {
  readonly statements: readonly SelectedStatement[]
  readonly fixes: readonly string[]
}

/**
 * Why the move at `index` of the request was refused: its range or the
 * engine could not carry it out, or its candidate added project diagnostics.
 */
export type MoveRefusal =
  | {
      readonly kind: "input"
      readonly index: number
      readonly message: string
    }
  | {
      readonly kind: "diagnostics"
      readonly index: number
      readonly diagnostics: readonly ReportedDiagnostic[]
    }

/**
 * The outcome of a whole request. `moves` holds a record for each move the
 * engine carried out, a move its diagnostics refused included. The first
 * refused move ends the request, because each later range is followed through
 * the moves before it.
 */
export type MovesCandidate =
  | {
      readonly kind: "accepted"
      readonly importEnding: ImportEnding
      readonly moves: readonly MoveRecord[]
      readonly files: readonly CandidateFile[]
    }
  | {
      readonly kind: "refused"
      readonly importEnding: ImportEnding
      readonly moves: readonly MoveRecord[]
      readonly refusal: MoveRefusal
    }

interface OverlayEntry {
  text: string
  version: number
  readonly isNew: boolean
}

/**
 * One move resolved against the saved source. Each anchor is the start of one
 * selected statement in the source as the overlay now holds it. An edit that
 * replaces the text at an anchor leaves none.
 */
interface PlannedMove {
  readonly range: MoveRange
  readonly statements: readonly SelectedStatement[]
  readonly anchors: (number | undefined)[]
}

interface MoveContext {
  readonly service: ts.LanguageService
  readonly overlay: Map<string, OverlayEntry>
  readonly sourcePath: string
  /** The source's name as the engine spells it in its edits. */
  readonly sourceFileName: string
  readonly planned: readonly PlannedMove[]
  readonly preferences: ts.UserPreferences
  readonly display: (fileName: string) => string
}

interface MoveOutcome {
  readonly fixes: readonly string[]
  readonly after: readonly KeyedDiagnostic[]
  readonly added: readonly KeyedDiagnostic[]
}

export function prepareMoves(request: MovesRequest): MovesCandidate {
  const parsed = loadConfiguration(request)
  const overlay = new Map<string, OverlayEntry>()
  const service = createService(parsed, overlay, request.configPath)
  const display = (fileName: string) => path.relative(request.root, fileName)

  const program = requireProgram(service)
  const sourceFile = program.getSourceFile(request.sourcePath)
  if (sourceFile === undefined) {
    throw new MoveInputError(
      `${display(request.sourcePath)} is not part of ${display(request.configPath)}`,
    )
  }
  const importEnding = sourceImportEnding(sourceFile)
  const refused = (
    moves: readonly MoveRecord[],
    refusal: MoveRefusal,
  ): MovesCandidate => ({ kind: "refused", importEnding, moves, refusal })

  // Every range is resolved against the saved source before the first move,
  // so a range that selects no complete statements costs no engine move.
  const planned: PlannedMove[] = []
  const claimed = new Set<ts.Statement>()
  for (const [index, range] of request.moves.entries()) {
    try {
      planned.push(
        planMove(
          sourceFile,
          program.getTypeChecker(),
          range,
          claimed,
          display(request.sourcePath),
        ),
      )
    } catch (error) {
      if (!(error instanceof MoveInputError)) {
        throw error
      }
      return refused([], { kind: "input", index, message: error.message })
    }
  }

  const context: MoveContext = {
    service,
    overlay,
    sourcePath: request.sourcePath,
    sourceFileName: sourceFile.fileName,
    planned,
    preferences: {
      allowTextChangesInNewFiles: true,
      provideRefactorNotApplicableReason: true,
      importModuleSpecifierEnding: importEnding,
    },
    display,
  }
  let baseline = countKeys(projectDiagnostics(program))
  const records: MoveRecord[] = []
  for (const [index, move] of planned.entries()) {
    let outcome: MoveOutcome
    try {
      outcome = carryOut(context, move, baseline)
    } catch (error) {
      if (!(error instanceof MoveInputError)) {
        throw error
      }
      return refused(records, { kind: "input", index, message: error.message })
    }
    records.push({ statements: move.statements, fixes: outcome.fixes })
    if (outcome.added.length > 0) {
      return refused(records, {
        kind: "diagnostics",
        index,
        diagnostics: outcome.added.map(({ diagnostic }) =>
          report(diagnostic, display),
        ),
      })
    }
    baseline = countKeys(outcome.after)
  }
  return {
    kind: "accepted",
    importEnding,
    moves: records,
    files: [...overlay.entries()].map(([fileName, entry]) => ({
      path: fileName,
      text: entry.text,
      isNew: entry.isNew,
    })),
  }
}

function createService(
  parsed: ts.ParsedCommandLine,
  overlay: ReadonlyMap<string, OverlayEntry>,
  configPath: string,
): ts.LanguageService {
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
    getCurrentDirectory: () => path.dirname(configPath),
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
  return ts.createLanguageService(host, ts.createDocumentRegistry())
}

function planMove(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  range: MoveRange,
  claimed: Set<ts.Statement>,
  sourceLabel: string,
): PlannedMove {
  const selected = selectStatements(sourceFile, checker, range, sourceLabel)
  const repeated = selected.find((statement) => claimed.has(statement))
  if (repeated !== undefined) {
    throw new MoveInputError(
      `lines ${range.startLine}-${range.endLine} hold the statement at ${describeLines(sourceFile, repeated)}, which an earlier range already moves`,
    )
  }
  for (const statement of selected) {
    claimed.add(statement)
  }
  return {
    range,
    statements: selected.map((statement) =>
      selectedStatement(sourceFile, statement),
    ),
    anchors: selected.map((statement) => statement.getStart(sourceFile)),
  }
}

function carryOut(
  context: MoveContext,
  move: PlannedMove,
  baseline: ReadonlyMap<string, number>,
): MoveOutcome {
  const { service, sourcePath, preferences, display } = context
  const sourceFile = requireProgram(service).getSourceFile(sourcePath)
  if (sourceFile === undefined) {
    throw new Error("the source left the program during the moves")
  }
  const range = locate(sourceFile, move)

  const offered = service
    .getApplicableRefactors(
      sourcePath,
      range,
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
    sourcePath,
    FORMAT_SETTINGS,
    range,
    MOVE_TO_FILE,
    MOVE_TO_FILE,
    preferences,
    // The refactor keeps this spelling for a new file. Its later reads use
    // forward slashes, so the overlay must receive the same path on Windows.
    { targetFile: move.range.targetPath.replaceAll(path.sep, "/") },
  )
  if (edits?.notApplicableReason !== undefined) {
    throw new MoveInputError(
      `the language service declined the move: ${edits.notApplicableReason}`,
    )
  }
  if (edits === undefined || edits.edits.length === 0) {
    throw new MoveInputError("the language service returned no edits")
  }
  applyChanges(context, edits.edits)

  const fixes: string[] = []
  const attempted = new Set<string>()
  for (;;) {
    const changedProgram = requireProgram(service)
    const changedDiagnostics = [...context.overlay.keys()].flatMap(
      (fileName) => {
        const file = changedProgram.getSourceFile(fileName)
        return file === undefined ? [] : fileDiagnostics(changedProgram, file)
      },
    )
    const next = introduced(baseline, changedDiagnostics).find(
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
        diagnostic.file?.fileName ?? sourcePath,
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
    applyChanges(context, fix.changes)
    fixes.push(
      `${fix.description} in ${display(diagnostic.file?.fileName ?? "")}`,
    )
  }

  const after = projectDiagnostics(requireProgram(service))
  return { fixes, after, added: introduced(baseline, after) }
}

/**
 * Finds the planned statements in the source as the earlier moves left it.
 * They must still be one run of consecutive top-level statements, so the
 * range handed to the engine selects exactly them.
 */
function locate(sourceFile: ts.SourceFile, move: PlannedMove): ts.TextRange {
  const { statements } = sourceFile
  const positions = move.anchors.map((anchor) =>
    anchor === undefined
      ? -1
      : statements.findIndex(
          (statement) =>
            statement.getStart(sourceFile) <= anchor && anchor < statement.end,
        ),
  )
  const first = positions[0]
  if (
    positions.some(
      (position, offset) => position === -1 || position !== first + offset,
    )
  ) {
    throw new MoveInputError(
      `an earlier move changed or separated the statements at lines ${move.range.startLine}-${move.range.endLine}`,
    )
  }
  return {
    pos: statements[first].getStart(sourceFile),
    end: statements[positions[positions.length - 1]].end,
  }
}

function applyChanges(
  context: MoveContext,
  changes: readonly ts.FileTextChanges[],
): void {
  for (const change of changes) {
    const current = context.overlay.get(change.fileName)
    const base =
      current?.text ??
      (change.isNewFile ? "" : (ts.sys.readFile(change.fileName) ?? ""))
    context.overlay.set(change.fileName, {
      text: applyTextChanges(base, change.textChanges),
      version: (current?.version ?? 0) + 1,
      isNew: current?.isNew ?? change.isNewFile === true,
    })
    if (change.fileName === context.sourceFileName) {
      for (const move of context.planned) {
        mapAnchors(move.anchors, change.textChanges)
      }
    }
  }
}

/**
 * Moves each anchor past the changes before it. The changes are ascending
 * and refer to the text before any of them. An insertion at an anchor lands
 * before it, such as the `export` the engine adds to a declaration the moved
 * code uses. An anchor inside replaced text is lost.
 */
function mapAnchors(
  anchors: (number | undefined)[],
  changes: readonly ts.TextChange[],
): void {
  for (const [index, anchor] of anchors.entries()) {
    if (anchor === undefined) {
      continue
    }
    let shift = 0
    let lost = false
    for (const { span, newText } of changes) {
      if (span.start + span.length <= anchor) {
        shift += newText.length - span.length
      } else if (span.start <= anchor) {
        lost = true
        break
      }
    }
    anchors[index] = lost ? undefined : anchor + shift
  }
}

function loadConfiguration(request: MovesRequest): ts.ParsedCommandLine {
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

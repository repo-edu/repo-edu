import ts from "typescript"
import { MoveInputError } from "./input-error.js"

/**
 * Resolves a line range of a source file to the complete top-level statements
 * a move may take, and describes them in the file's lines.
 */

/** A selected statement, in the lines of the saved source. */
export interface SelectedStatement {
  readonly startLine: number
  readonly endLine: number
  readonly firstLine: string
}

function lineOf(sourceFile: ts.SourceFile, position: number): number {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1
}

export function describeLines(
  sourceFile: ts.SourceFile,
  statement: ts.Statement,
): string {
  return `lines ${lineOf(sourceFile, statement.getStart(sourceFile))}-${lineOf(sourceFile, statement.end)}`
}

export function selectStatements(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  range: { readonly startLine: number; readonly endLine: number },
  sourceLabel: string,
): ts.Statement[] {
  const lineStarts = sourceFile.getLineStarts()
  const { startLine, endLine } = range
  if (startLine < 1 || endLine < startLine || endLine > lineStarts.length) {
    throw new MoveInputError(
      `lines ${startLine}-${endLine} are outside ${sourceLabel}, which has ${lineStarts.length} lines`,
    )
  }
  const rangeStart = lineStarts[startLine - 1]
  const rangeEnd =
    endLine < lineStarts.length ? lineStarts[endLine] : sourceFile.text.length

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
        `lines ${startLine}-${endLine} cut the top-level statement at ${describeLines(sourceFile, statement)}`,
      )
    }
    if (
      ts.isImportDeclaration(statement) ||
      (ts.isImportEqualsDeclaration(statement) &&
        ts.isExternalModuleReference(statement.moduleReference))
    ) {
      throw new MoveInputError(
        `the import at ${describeLines(sourceFile, statement)} cannot be moved; imports follow the moved statements`,
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
          `${statement.name.text} has a declaration at ${describeLines(sourceFile, outside)} outside lines ${startLine}-${endLine}; select all its declarations`,
        )
      }
    }
  }
  return selected
}

export function selectedStatement(
  sourceFile: ts.SourceFile,
  statement: ts.Statement,
): SelectedStatement {
  const lineStarts = sourceFile.getLineStarts()
  const line = lineOf(sourceFile, statement.getStart(sourceFile))
  const lineEnd =
    line < lineStarts.length ? lineStarts[line] : sourceFile.text.length
  return {
    startLine: line,
    endLine: lineOf(sourceFile, statement.end),
    firstLine: sourceFile.text.slice(lineStarts[line - 1], lineEnd).trimEnd(),
  }
}

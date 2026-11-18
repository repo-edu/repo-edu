import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { Command, InvalidArgumentError } from "commander"
import { MoveInputError } from "./input-error.js"
import { moveStatements } from "./move.js"
import type { MoveCandidate } from "./move-service.js"

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
)

function lineNumber(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new InvalidArgumentError("expected a line number from 1")
  }
  return Number(value)
}

function render(source: string, candidate: MoveCandidate): string {
  const lines = [`Selected statements in ${source}:`]
  for (const statement of candidate.statements) {
    lines.push(
      `  ${statement.startLine}-${statement.endLine}  ${statement.firstLine.trim()}`,
    )
  }
  lines.push(`Import ending: ${candidate.importEnding}`)
  for (const fix of candidate.fixes) {
    lines.push(`Import-kind fix: ${fix}`)
  }
  if (candidate.kind === "accepted") {
    lines.push("Moved. Changed files:")
    for (const file of candidate.files) {
      lines.push(
        `  ${path.relative(ROOT, file.path)}${file.isNew ? " (new)" : ""}`,
      )
    }
  } else {
    lines.push(
      "Refused: the move adds TypeScript 6 project diagnostics. No file was written; move this code by hand.",
    )
    for (const diagnostic of candidate.diagnostics) {
      const location =
        diagnostic.path === undefined
          ? "(project)"
          : `${diagnostic.path}:${diagnostic.line}:${diagnostic.column}`
      lines.push(`  ${location} TS${diagnostic.code} ${diagnostic.message}`)
    }
  }
  return lines.join("\n")
}

const program = new Command()
  .name("move-statements")
  .description(
    "Move complete top-level TypeScript statements to another file with TypeScript's Move to file refactor.",
  )
  .argument("<source>", "workspace-relative source file")
  .argument("<start-line>", "first line of the range", lineNumber)
  .argument("<end-line>", "last line of the range", lineNumber)
  .argument("<target>", "workspace-relative target file, new or existing")
  .action(
    (source: string, startLine: number, endLine: number, target: string) => {
      try {
        const candidate = moveStatements({
          root: ROOT,
          source,
          startLine,
          endLine,
          target,
        })
        console.log(render(source, candidate))
        process.exitCode = candidate.kind === "accepted" ? 0 : 1
      } catch (error) {
        if (error instanceof MoveInputError) {
          console.error(
            `move-statements: ${error.message}. No file was written.`,
          )
          process.exitCode = 1
          return
        }
        throw error
      }
    },
  )

program.parse()

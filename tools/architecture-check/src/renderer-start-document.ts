import { readFileSync } from "node:fs"
import { sessionStartInventory } from "../../../packages/renderer-app/src/session/session-start-inventory.js"
import { repoPathToAbsolute } from "./repo-paths.js"
import type { Violation } from "./violations.js"

export const rendererStartDocument = "packages/renderer-app/CLAUDE.md"
export const startTableBegin = "<!-- session-start-inventory:begin -->"
export const startTableEnd = "<!-- session-start-inventory:end -->"

export function renderSessionStartTable(): string {
  return [
    startTableBegin,
    "",
    "| Control | Where | Starts | Cancel |",
    "| --- | --- | --- | --- |",
    ...Object.values(sessionStartInventory).map(
      ({ control, where, starts, cancel }) =>
        `| ${control} | ${where} | ${starts} | ${cancel} |`,
    ),
    "",
    startTableEnd,
  ].join("\n")
}

export function checkRendererStartDocumentSource(
  document: string,
): Violation[] {
  const beginning = document.indexOf(startTableBegin)
  const ending = document.indexOf(startTableEnd)
  const section = document.slice(beginning, ending + startTableEnd.length)
  if (
    beginning >= 0 &&
    ending > beginning &&
    section === renderSessionStartTable()
  )
    return []
  return [
    {
      file: rendererStartDocument,
      message:
        "The generated start table differs from session-start-inventory.ts. Run pnpm generate:session-starts.",
    },
  ]
}

export function checkRendererStartDocument(root: string): Violation[] {
  return checkRendererStartDocumentSource(
    readFileSync(repoPathToAbsolute(root, rendererStartDocument), "utf8"),
  )
}

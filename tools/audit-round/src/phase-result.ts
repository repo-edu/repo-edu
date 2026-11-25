import { z } from "zod"
import type { WatchGrade } from "./glance.js"
import type { Phase, PhaseControlResult } from "./phase.js"

const prefix = "PHASE RESULT: "
const watchGradePrefix = "Watch grade: "

/**
 * Whether a response ends with the runner's control line, whatever the line
 * holds. A response without one has not said how its phase ended.
 */
export function hasPhaseResult(text: string): boolean {
  return text.trimEnd().split("\n").at(-1)?.startsWith(prefix) ?? false
}

/** Remove the runner's final control line from a report or displayed message. */
export function withoutPhaseResult(text: string): string {
  const lines = text.trimEnd().split("\n")
  if (hasPhaseResult(text)) lines.pop()
  return lines.join("\n").trimEnd()
}

const watchGrades = new Set<WatchGrade>(["green", "amber", "red"])

/** Admit the document and grade returned by a finished watch session. */
export function watchOutput(text: string): {
  readonly document: string
  readonly grade: WatchGrade
} {
  const lines = withoutPhaseResult(text).split("\n")
  const gradeLine = lines.pop() ?? ""
  if (!gradeLine.startsWith(watchGradePrefix))
    throw new Error("Missing watch grade line")
  const grade = gradeLine.slice(watchGradePrefix.length).replace(/\.$/, "")
  if (!watchGrades.has(grade as WatchGrade))
    throw new Error("Invalid watch grade line")
  const document = lines.join("\n").trimEnd()
  if (document.length === 0) throw new Error("Watch document is empty")
  return { document, grade: grade as WatchGrade }
}

const resultSchema = z.strictObject({
  status: z.enum(["finished", "needs-ruling", "failed"]),
  reason: z.string().nullable(),
})

export function phaseResult(
  sessionId: string,
  text: string,
): PhaseControlResult<Exclude<Phase, "fix" | "implement" | "close">> {
  if (!hasPhaseResult(text)) throw new Error("Missing final PHASE RESULT line")
  const line = text.trimEnd().split("\n").at(-1) ?? ""
  const result = resultSchema.parse(JSON.parse(line.slice(prefix.length)))
  if (result.status === "failed") {
    if (!result.reason?.trim()) throw new Error("Invalid failed PHASE RESULT")
    return { status: "failed", sessionId, reason: result.reason }
  }
  if (result.reason !== null) throw new Error("Unexpected PHASE RESULT reason")
  if (result.status !== "finished")
    throw new Error("Report PHASE RESULT must finish")
  return {
    status: "finished",
    sessionId,
  }
}

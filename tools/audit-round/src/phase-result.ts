import { z } from "zod"
import type { WatchGrade } from "./glance.js"
import type { Phase, PhaseControlResult } from "./phase.js"

const prefix = "PHASE RESULT: "
const watchGradePrefix = "Watch grade: "

/** Remove the runner's final control line from a report or displayed message. */
export function withoutPhaseResult(text: string): string {
  const lines = text.trimEnd().split("\n")
  if (lines.at(-1)?.startsWith(prefix)) lines.pop()
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
  const grade = gradeLine.slice(watchGradePrefix.length)
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

export function phaseResult<P extends Phase>(
  phase: P,
  sessionId: string,
  text: string,
): PhaseControlResult<P> {
  const line = text.trimEnd().split("\n").at(-1) ?? ""
  if (!line.startsWith(prefix))
    throw new Error("Missing final PHASE RESULT line")
  const result = resultSchema.parse(JSON.parse(line.slice(prefix.length)))
  if (result.status === "failed") {
    if (!result.reason?.trim()) throw new Error("Invalid failed PHASE RESULT")
    return { status: "failed", sessionId, reason: result.reason }
  }
  if (result.reason !== null) throw new Error("Unexpected PHASE RESULT reason")
  if (phase === "fix") {
    return {
      status: result.status,
      sessionId,
    } as PhaseControlResult<P>
  }
  if (result.status !== "finished")
    throw new Error("Report PHASE RESULT must finish")
  return {
    status: "finished",
    sessionId,
  } as PhaseControlResult<P>
}

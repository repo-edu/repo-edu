import { z } from "zod"
import type { Phase, PhaseResult } from "./phase.js"

const prefix = "PHASE RESULT: "

/** Remove the runner's final control line from a report or displayed message. */
export function withoutPhaseResult(text: string): string {
  const lines = text.trimEnd().split("\n")
  if (lines.at(-1)?.startsWith(prefix)) lines.pop()
  return lines.join("\n").trimEnd()
}

const resultSchema = z.strictObject({
  status: z.enum(["finished", "needs-ruling", "failed"]),
  reason: z.string().nullable(),
})

export function phaseResult<P extends Phase>(
  phase: P,
  sessionId: string,
  text: string,
): PhaseResult<P> {
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
    } as PhaseResult<P>
  }
  if (result.status !== "finished")
    throw new Error("Report PHASE RESULT must finish")
  return {
    status: "finished",
    sessionId,
  } as PhaseResult<P>
}

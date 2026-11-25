import { z } from "zod"
import type { Phase, PhaseControlResult } from "./phase.js"

const status = z.enum(["finished", "failed", "needs-ruling"])
const ending = {
  reason: z.string().nullable().describe("The reason the phase failed"),
  closingNote: z.string().describe("The phase's closing note in Markdown"),
}
const settling = z.strictObject({
  recommendation: z.enum(["settle", "keep open"]),
  reason: z.string().regex(/^\S[^\r\n]*$/),
})

const schemas = {
  fix: z.strictObject({
    status,
    ...ending,
    settling: settling.nullable().describe("The widening recommendation"),
  }),
  implement: z.strictObject({ status, ...ending }),
  close: z.strictObject({ status: z.enum(["finished", "failed"]), ...ending }),
}

type StructuredPhase = keyof typeof schemas

export function usesStructuredResult(phase: Phase): phase is StructuredPhase {
  return Object.hasOwn(schemas, phase)
}

export function outputSchema(phase: StructuredPhase): string {
  return JSON.stringify(z.toJSONSchema(schemas[phase], { target: "draft-7" }))
}

export function closingNote(
  phase: StructuredPhase,
  value: unknown,
): string | undefined {
  const answer = schemas[phase].safeParse(value)
  return answer.success ? answer.data.closingNote : undefined
}

export function structuredPhaseResult(
  phase: StructuredPhase,
  sessionId: string,
  value: unknown,
): { result: PhaseControlResult<StructuredPhase>; text: string } {
  const fix = phase === "fix" ? schemas.fix.parse(value) : null
  const answer = fix ?? schemas[phase].parse(value)
  const { status, reason, closingNote } = answer
  const advice = fix?.settling ?? null
  if (status !== "finished" && advice !== null)
    throw new Error("Only a finished fix returns settling advice")
  if (status === "failed") {
    if (!reason?.trim()) throw new Error("A failed phase needs a reason")
    return {
      result: { status, sessionId, reason },
      text: closingNote,
    }
  }
  if (reason !== null)
    throw new Error("Only a failed phase returns a failure reason")
  if (status === "needs-ruling")
    return { result: { status, sessionId }, text: closingNote }
  if (phase !== "fix")
    return { result: { status, sessionId }, text: closingNote }

  const recommendation =
    advice === null ? null : `${advice.recommendation}. ${advice.reason}`
  return {
    result: { status, sessionId, settling: recommendation },
    text: [closingNote, recommendation && `Settling: ${recommendation}`]
      .filter(Boolean)
      .join("\n\n"),
  }
}

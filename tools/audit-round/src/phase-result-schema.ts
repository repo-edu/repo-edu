import { z } from "zod"
import type {
  FinishedReport,
  Phase,
  PhaseControlResult,
  PhaseFailure,
  PhaseInput,
  RulerScope,
} from "./phase.js"
import { auditReport, auditSchema, settlingAdvice } from "./report.js"
import { rulerReport, rulerSchema } from "./ruler-report.js"
import { rebuttalReport, rebuttalSchema, vetReport, vetSchema } from "./vet.js"

const status = z.enum(["finished", "failed", "needs-ruling"])
const ending = {
  reason: z.string().nullable().describe("The reason the phase failed"),
  closingNote: z.string().describe("The phase's closing note in Markdown"),
}

const schemas = {
  fix: z.strictObject({
    status,
    ...ending,
    settling: settlingAdvice.nullable().describe("The widening recommendation"),
  }),
  implement: z.strictObject({ status, ...ending }),
  close: z.strictObject({ status: z.enum(["finished", "failed"]), ...ending }),
}

type StructuredPhase = keyof typeof schemas

export function usesClosingNote(phase: Phase): phase is StructuredPhase {
  return Object.hasOwn(schemas, phase)
}

export function usesStructuredResult(phase: Phase): boolean {
  return (
    usesClosingNote(phase) ||
    phase === "audit" ||
    phase === "vet" ||
    phase === "rebut" ||
    phase === "rule"
  )
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

type ReportContract = {
  readonly file: string
  readonly schema: string
  readonly read: (
    sessionId: string,
    value: unknown,
  ) =>
    | { readonly result: PhaseFailure }
    | { readonly result: FinishedReport; readonly text: string }
}

type ReportDetails<T extends FinishedReport = FinishedReport> =
  T extends FinishedReport ? Omit<T, "status" | "sessionId"> : never

function reportContract<Payload>(
  file: string,
  payload: z.ZodType<Payload>,
  render: (payload: Payload) => {
    readonly text: string
    readonly details: ReportDetails
  },
): ReportContract {
  const definition = z.strictObject({
    status: z.enum(["finished", "failed"]),
    reason: z.string().nullable().describe("The reason the phase failed"),
    report: payload.nullable().describe("The completed report's fields"),
  })
  return {
    file,
    schema: JSON.stringify(z.toJSONSchema(definition, { target: "draft-7" })),
    read(sessionId, value) {
      const { status, reason, report } = definition.parse(value)
      if (status === "failed") {
        if (!reason?.trim()) throw new Error("A failed phase needs a reason")
        if (report !== null)
          throw new Error("Only a finished phase returns report fields")
        return { result: { status, sessionId, reason } }
      }
      if (reason !== null)
        throw new Error("Only a failed phase returns a failure reason")
      if (report === null)
        throw new Error("A finished phase needs its report fields")
      const { text, details } = render(report)
      return {
        text,
        result: { status, sessionId, ...details },
      }
    },
  }
}

export function roundReportContract(
  input: PhaseInput,
): ReportContract | undefined {
  switch (input.phase) {
    case "audit":
      return reportContract(
        input.arguments[0],
        auditSchema(input.reportScope),
        (answer) => {
          const { text, report } = auditReport(input.reportScope, answer)
          return { text, details: { report } }
        },
      )
    case "vet":
      return reportContract(
        input.arguments[1],
        vetSchema(input.findings),
        (answer) => {
          const { text, reviews } = vetReport(input.findings, answer)
          return { text, details: { reviews } }
        },
      )
    case "rebut":
      return reportContract(
        input.arguments.at(-1) as string,
        rebuttalSchema(input.findings, input.reviews),
        (answer) => {
          const { text, answers } = rebuttalReport(
            input.findings,
            input.reviews,
            answer,
          )
          return { text, details: { answers } }
        },
      )
    case "rule": {
      const scope = input.arguments.at(-1) as RulerScope
      const given = scope.findings.map(({ finding, tier }) => ({
        number: finding,
        tier,
      }))
      return reportContract(
        input.arguments.at(-2) as string,
        rulerSchema(given, input.panel),
        (answer) => {
          const { text, reading } = rulerReport(given, answer)
          return { text, details: { reading } }
        },
      )
    }
  }
}

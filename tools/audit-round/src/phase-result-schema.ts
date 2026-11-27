import { z } from "zod"
import { watchGradeSchema } from "./glance.js"
import type {
  FinishedReport,
  PhaseControlResult,
  PhaseFailure,
  PhaseInput,
  PhaseResult,
  RulerScope,
  WatchResult,
} from "./phase.js"
import { auditReport, auditSchema, settlingAdvice } from "./report.js"
import { rulerReport, rulerSchema } from "./ruler-report.js"
import { designSchema, pickSchema } from "./split-result-schema.js"
import { rebuttalReport, rebuttalSchema, vetReport, vetSchema } from "./vet.js"

const completedStatus = z.enum(["finished", "failed"])
const status = z.enum(["finished", "failed", "needs-ruling"])
const reason = z.string().nullable().describe("The reason the phase failed")
const ending = {
  reason,
  closingNote: z.string().describe("The phase's closing note in Markdown"),
}

const schemas = {
  fix: z.strictObject({
    status,
    ...ending,
    settling: settlingAdvice.nullable().describe("The widening recommendation"),
  }),
  implement: z.strictObject({ status, ...ending }),
  close: z.strictObject({ status: completedStatus, ...ending }),
}

type StructuredPhase = keyof typeof schemas

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

type ResultContract = {
  readonly file?: string
  readonly schema: string
  readonly recognise: (value: unknown) => { readonly note?: string } | null
  readonly read: (
    sessionId: string,
    value: unknown,
  ) => {
    readonly result: PhaseResult
    readonly text?: string
  }
}

type ReportDetails<T extends FinishedReport = FinishedReport> =
  T extends FinishedReport ? Omit<T, "status" | "sessionId"> : never

function resultShape<Shape>(
  definition: z.ZodType<Shape>,
  closingNote?: (answer: Shape) => string,
): Pick<ResultContract, "schema" | "recognise"> {
  return {
    schema: JSON.stringify(z.toJSONSchema(definition, { target: "draft-7" })),
    recognise(value) {
      const answer = definition.safeParse(value)
      if (!answer.success) return null
      return closingNote === undefined ? {} : { note: closingNote(answer.data) }
    },
  }
}

const documentEnding = { status: completedStatus, reason }

function documentResult<Payload>(
  sessionId: string,
  ending: { status: z.infer<typeof completedStatus>; reason: string | null },
  payload: Payload | null,
  name: string,
): { result: PhaseFailure } | { payload: Payload } {
  const { status, reason } = ending
  if (status === "failed") {
    if (!reason?.trim()) throw new Error("A failed phase needs a reason")
    if (payload !== null)
      throw new Error(`Only a finished phase returns ${name}`)
    return { result: { status, sessionId, reason } }
  }
  if (reason !== null)
    throw new Error("Only a failed phase returns a failure reason")
  if (payload === null) throw new Error(`A finished phase needs its ${name}`)
  return { payload }
}

function reportContract<Payload>(
  file: string,
  payload: z.ZodType<Payload>,
  render: (payload: Payload) => {
    readonly text: string
    readonly details: ReportDetails
  },
): ResultContract {
  const definition = z.strictObject({
    ...documentEnding,
    report: payload.nullable().describe("The completed report's fields"),
  })
  return {
    file,
    ...resultShape(definition),
    read(sessionId, value) {
      const answer = definition.parse(value)
      const admitted = documentResult(
        sessionId,
        answer,
        answer.report,
        "report fields",
      )
      if ("result" in admitted) return admitted
      const { text, details } = render(admitted.payload)
      return {
        text,
        result: { status: "finished", sessionId, ...details },
      }
    },
  }
}

type DocumentDetails =
  | Pick<WatchResult, "document" | "grade">
  | Pick<Extract<PhaseResult<"design">, { status: "finished" }>, "design">
  | Pick<Extract<PhaseResult<"pick">, { status: "finished" }>, "pick">

function documentContract<Payload>(
  payload: z.ZodType<Payload>,
  details: (payload: Payload) => DocumentDetails,
): ResultContract {
  const definition = z.strictObject({
    ...documentEnding,
    result: payload.nullable().describe("The completed phase's fields"),
  })
  return {
    ...resultShape(definition),
    read(sessionId, value) {
      const answer = definition.parse(value)
      const admitted = documentResult(
        sessionId,
        answer,
        answer.result,
        "result fields",
      )
      if ("result" in admitted) return admitted
      return {
        result: { status: "finished", sessionId, ...details(admitted.payload) },
      }
    },
  }
}

const watchSchema = z.strictObject({
  document: z.string().describe("The finished watch document in Markdown"),
  grade: watchGradeSchema.describe("The watch grade"),
})

export function phaseResultContract(input: PhaseInput): ResultContract {
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
    case "fix":
    case "implement":
    case "close":
      return {
        ...resultShape(schemas[input.phase], (answer) => answer.closingNote),
        read: (sessionId, value) =>
          structuredPhaseResult(input.phase, sessionId, value),
      }
    case "watch":
      return documentContract(watchSchema, ({ document, grade }) => {
        if (!document.trim()) throw new Error("Watch document is empty")
        return { document: document.trimEnd(), grade }
      })
    case "design":
      return documentContract(designSchema, (design) => ({ design }))
    case "pick":
      return documentContract(pickSchema(input.arguments[2]), (pick) => ({
        pick,
      }))
  }
}

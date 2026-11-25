import { z } from "zod"
import { areaPattern, listResults, pathPattern } from "./move-list.js"

const sentence = z
  .string()
  .trim()
  .regex(/^\S[^\r\n]*$/)
const line = z.int().positive()
const area = z
  .string()
  .regex(areaPattern)
  .describe("The source's primary area ID")

export const designSchema = z.union([
  z.strictObject({
    area,
    kind: z.literal("moves"),
    moves: z
      .array(
        z.strictObject({
          target: z
            .string()
            .regex(pathPattern)
            .describe("The target path relative to Repo Edu"),
          responsibility: sentence.describe("The target's responsibility"),
          ranges: z
            .array(z.strictObject({ start: line, end: line }))
            .min(1)
            .describe("The inclusive line ranges in the original source"),
        }),
      )
      .min(1)
      .describe("The moves in execution order"),
  }),
  z.strictObject({
    area,
    kind: z.literal("no-split"),
    result: z.enum(listResults),
    reason: sentence.describe("Why the file should stay whole or needs a plan"),
  }),
])

export type DesignAnswer = z.infer<typeof designSchema>

export type PickCandidate = {
  readonly number: number
  readonly path: string
  readonly refusal: string | null
}

export function pickSchema(candidates: readonly PickCandidate[]) {
  const eligible = candidates.filter(({ refusal }) => refusal === null)
  return z.strictObject({
    judgements: z
      .strictObject(
        Object.fromEntries(
          candidates.map(({ number }) => [number, z.string().trim().min(1)]),
        ),
      )
      .describe("The judgement on each supplied answer, by number"),
    number: z
      .literal(eligible.map(({ number }) => number))
      .nullable()
      .describe(
        "The chosen answer number, or null for the picker's own no-split answer",
      ),
    reason: z.string().trim().min(1).describe("The main reason for the choice"),
    repairs: z
      .array(z.string().trim().min(1))
      .describe("Each repair with the fact that requires it"),
    replacement: designSchema
      .nullable()
      .describe("The repaired move list or the picker's own no-split answer"),
  })
}

export type PickAnswer = z.infer<ReturnType<typeof pickSchema>>

export function pickReport(
  candidates: readonly PickCandidate[],
  pick: PickAnswer,
): string {
  const judgements = candidates.map(
    ({ number }) =>
      `### Answer ${number}\n\n${pick.judgements[String(number)]}`,
  )
  const repairs = pick.repairs.map(
    (repair, index) => `### Repair ${index + 1}\n\n${repair}`,
  )
  return [
    ...judgements,
    `### Reason for the choice\n\n${pick.reason}`,
    ...repairs,
    `Pick: ${pick.number ?? "none"}`,
  ].join("\n\n")
}

import { z } from "zod"
import { type FindingIdentity, findingTier } from "./report.js"
import type {
  FindingRebuttal,
  FindingReview,
  PanelVet,
  RebuttalAnswer,
  VetVerdict,
} from "./round-data.js"

const vetWords = {
  accept: "Accept",
  revise: "Revise",
  drop: "Drop",
  "needs-user-ruling": "Needs user's ruling",
} as const satisfies Record<VetVerdict, string>

const rebuttalWords = {
  agree: "Agree",
  contest: "Contest",
  "for-user-ruling": "For user's ruling",
} as const satisfies Record<RebuttalAnswer, string>

export function vetSchema(findings: readonly FindingIdentity[]) {
  const explanation = z
    .string()
    .describe("The verdict's explanation in Markdown")
  const cleanVerdict = z.strictObject({
    verdict: z.enum(["accept", "drop", "needs-user-ruling"]),
    revisedTier: z.null(),
    explanation,
  })
  const slots = Object.fromEntries(
    findings.map(({ number, tier }) => [
      number,
      z.union([
        cleanVerdict,
        z.strictObject({
          verdict: z.literal("revise"),
          revisedTier: findingTier.exclude([tier]).nullable(),
          explanation,
        }),
      ]),
    ]),
  )
  return z.strictObject({
    headDrift: z.string().describe("The note on head drift in Markdown"),
    verdicts: z
      .strictObject(slots)
      .describe("The verdict for each finding number"),
  })
}

export function vetReport(
  findings: readonly FindingIdentity[],
  answer: z.infer<ReturnType<typeof vetSchema>>,
): { readonly text: string; readonly reviews: readonly FindingReview[] } {
  const entries = findings.map(({ number, tier }) => {
    const { verdict, revisedTier, explanation } =
      answer.verdicts[String(number)]
    const word =
      revisedTier === null ? vetWords[verdict] : `Revise to [${revisedTier}]`
    return {
      review: {
        number,
        tier,
        verdict,
        ...(revisedTier === null ? {} : { revisedTier }),
      },
      text: [`${number}. [${tier}] ${word}`, explanation.trim()]
        .filter(Boolean)
        .join("\n\n"),
    }
  })
  return {
    text: [answer.headDrift.trim(), ...entries.map(({ text }) => text)]
      .filter(Boolean)
      .join("\n\n"),
    reviews: entries.map(({ review }) => review),
  }
}

function needsAnswer(
  panel: readonly PanelVet[],
  number: number,
): readonly string[] {
  return panel.flatMap(({ vet, reviews }) =>
    reviews.some(
      (review) => review.number === number && review.verdict !== "accept",
    )
      ? [vet]
      : [],
  )
}

export function rebuttalSchema(
  findings: readonly FindingIdentity[],
  panel: readonly PanelVet[],
) {
  const reply = z.strictObject({
    answer: z.enum(["agree", "contest", "for-user-ruling"]),
    explanation: z.string().describe("The answer's explanation in Markdown"),
  })
  const slots = Object.fromEntries(
    findings.flatMap(({ number }) => {
      const vets = needsAnswer(panel, number)
      return vets.length === 0
        ? []
        : [
            [
              number,
              z.strictObject(
                Object.fromEntries(vets.map((vet) => [vet, reply])),
              ),
            ],
          ]
    }),
  )
  return z.strictObject({
    answers: z
      .strictObject(slots)
      .describe("Answers by finding number and then vetter tag"),
  })
}

export function rebuttalReport(
  findings: readonly FindingIdentity[],
  panel: readonly PanelVet[],
  result: z.infer<ReturnType<typeof rebuttalSchema>>,
): { readonly text: string; readonly answers: readonly FindingRebuttal[] } {
  const entries = findings.flatMap(({ number, tier }) =>
    needsAnswer(panel, number).map((vet) => {
      const { answer, explanation } = result.answers[String(number)][vet]
      return {
        reading: { number, tier, vet, answer },
        text: [
          `${number}. [${tier}] [${vet}] ${rebuttalWords[answer]}`,
          explanation.trim(),
        ]
          .filter(Boolean)
          .join("\n\n"),
      }
    }),
  )
  return {
    text: entries.map(({ text }) => text).join("\n\n"),
    answers: entries.map(({ reading }) => reading),
  }
}

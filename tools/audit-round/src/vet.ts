import type { ReportFindings } from "./report.js"
import type {
  FindingRebuttal,
  FindingReview,
  RebuttalAnswer,
  VetVerdict,
} from "./round-data.js"

const vetVerdicts = {
  Accept: "accept",
  Revise: "revise",
  Drop: "drop",
  "Needs user's ruling": "needs-user-ruling",
} as const satisfies Record<string, VetVerdict>

const rebuttalAnswers = {
  Agree: "agree",
  Contest: "contest",
  "For user's ruling": "for-user-ruling",
} as const satisfies Record<string, RebuttalAnswer>

export type VetReading = {
  readonly reviews: readonly FindingReview[]
  readonly allAccepted: boolean
}

function checkFindingIdentity(
  number: number,
  tier: string,
  findings: ReportFindings,
): void {
  const finding = findings.find((candidate) => candidate.number === number)
  if (finding === undefined || finding.tier !== tier)
    throw new Error(
      "Review finding numbers and tiers must match the report exactly",
    )
}

/**
 * Verdicts have a fixed line grammar. Every other line is ignored.
 * Trailing whitespace, such as a Markdown hard break, carries no content.
 */
export function readVet(source: string, findings: ReportFindings): VetReading {
  const reviews: FindingReview[] = []
  for (const line of source.split(/\r?\n/)) {
    const verdict =
      /^([1-9]\d*)\. \[([A-D])\] (Accept|Revise|Drop|Needs user's ruling)$/.exec(
        line.trimEnd(),
      )
    if (verdict !== null) {
      const number = Number(verdict[1])
      checkFindingIdentity(number, verdict[2], findings)
      reviews.push({
        number,
        tier: verdict[2] as FindingReview["tier"],
        verdict: vetVerdicts[verdict[3] as keyof typeof vetVerdicts],
      })
    }
  }
  if (
    reviews.length !== findings.length ||
    reviews.some((review, index) => review.number !== findings[index]?.number)
  )
    throw new Error(
      "Vet verdict numbers must match the report's finding numbers exactly",
    )
  return {
    reviews,
    allAccepted: reviews.every((review) => review.verdict === "accept"),
  }
}

/** Read the numbered subset of findings the auditor answered after vetting. */
export function readRebuttal(
  source: string,
  findings: ReportFindings,
  reviews: readonly FindingReview[],
): readonly FindingRebuttal[] {
  const rebuttals: FindingRebuttal[] = []
  for (const line of source.split(/\r?\n/)) {
    const answer =
      /^([1-9]\d*)\. \[([A-D])\] (Agree|Contest|For user's ruling)$/.exec(
        line.trimEnd(),
      )
    if (answer === null) continue
    const number = Number(answer[1])
    checkFindingIdentity(number, answer[2], findings)
    if (rebuttals.some((rebuttal) => rebuttal.number === number))
      throw new Error(`Rebuttal answers finding ${number} more than once`)
    if ((rebuttals.at(-1)?.number ?? 0) >= number)
      throw new Error("Rebuttal answers must follow report order")
    rebuttals.push({
      number,
      tier: answer[2] as FindingRebuttal["tier"],
      answer: rebuttalAnswers[answer[3] as keyof typeof rebuttalAnswers],
    })
  }
  const missing = reviews.find(
    (review) =>
      review.verdict !== "accept" &&
      !rebuttals.some((rebuttal) => rebuttal.number === review.number),
  )
  if (missing !== undefined)
    throw new Error(`Rebuttal needs an answer for finding ${missing.number}`)
  return rebuttals
}

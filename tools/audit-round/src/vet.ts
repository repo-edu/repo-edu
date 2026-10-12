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

type Header<Word extends string> = {
  readonly number: number
  readonly tier: FindingReview["tier"]
  readonly word: Word
}

/**
 * A verdict or answer header is `<number>. [<tier>] <word>` and nothing else.
 * A line in that shape whose word is outside the phase's list is refused by
 * name rather than passed as free text, so a vet word on a rebuttal line, or
 * the reverse, fails on the line that is wrong instead of as a missing entry.
 * Every other line is free text for the fix phase. Whitespace at either end,
 * such as a Markdown hard break, carries no content.
 */
function readHeader<const Words extends Record<string, string>>(
  line: string,
  phase: string,
  words: Words,
): Header<keyof Words & string> | null {
  const header = /^([1-9]\d*)\. \[([A-D])\] (.+)$/.exec(line.trim())
  if (header === null) return null
  const word = header[3] as string
  if (!Object.hasOwn(words, word))
    throw new Error(
      `${phase} ${header[1]} uses the word "${word}"; use ${listWords(words)}`,
    )
  return {
    number: Number(header[1]),
    tier: header[2] as FindingReview["tier"],
    word: word as keyof Words & string,
  }
}

function listWords(words: Record<string, string>): string {
  const names = Object.keys(words)
  return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`
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

export function readVet(source: string, findings: ReportFindings): VetReading {
  const reviews: FindingReview[] = []
  for (const line of source.split(/\r?\n/)) {
    const header = readHeader(line, "Vet verdict", vetVerdicts)
    if (header === null) continue
    checkFindingIdentity(header.number, header.tier, findings)
    reviews.push({
      number: header.number,
      tier: header.tier,
      verdict: vetVerdicts[header.word],
    })
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
    const header = readHeader(line, "Rebuttal answer", rebuttalAnswers)
    if (header === null) continue
    checkFindingIdentity(header.number, header.tier, findings)
    if (rebuttals.some((rebuttal) => rebuttal.number === header.number))
      throw new Error(
        `Rebuttal answers finding ${header.number} more than once`,
      )
    if ((rebuttals.at(-1)?.number ?? 0) >= header.number)
      throw new Error("Rebuttal answers must follow report order")
    rebuttals.push({
      number: header.number,
      tier: header.tier,
      answer: rebuttalAnswers[header.word],
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

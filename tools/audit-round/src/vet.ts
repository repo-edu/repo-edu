import type { ReportFindings } from "./report.js"
import type {
  FindingRebuttal,
  FindingReview,
  RebuttalAnswer,
  VetVerdict,
} from "./round-data.js"

export const vetVerdicts = {
  Accept: "accept",
  Revise: "revise",
  Drop: "drop",
  "Needs user's ruling": "needs-user-ruling",
} as const satisfies Record<string, VetVerdict>

export const rebuttalAnswers = {
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

type VetHeader = Header<keyof typeof vetVerdicts & string> & {
  readonly revisedTier?: FindingReview["tier"]
}

/**
 * A verdict or answer header starts `<number>. [<tier>] <word>`. A revised vet
 * tier is the one admitted suffix. A line in that shape whose word is outside
 * the phase's list is refused by name rather than passed as free text, so a vet
 * word on a rebuttal line, or the reverse, fails on the line that is wrong
 * instead of as a missing entry. Every other line is free text for the fix
 * phase. Whitespace at either end, such as a Markdown hard break, carries no
 * content.
 */
function readHeaderLine(line: string): Header<string> | null {
  const header = /^([1-9]\d*)\. \[([A-D])\] (.+)$/.exec(line.trim())
  if (header === null) return null
  return {
    number: Number(header[1]),
    tier: header[2] as FindingReview["tier"],
    word: header[3] as string,
  }
}

function readHeader<const Words extends Record<string, string>>(
  line: string,
  phase: string,
  words: Words,
): Header<keyof Words & string> | null {
  const header = readHeaderLine(line)
  if (header === null) return null
  const { word } = header
  if (!Object.hasOwn(words, word))
    throw new Error(
      `${phase} ${header.number} uses the word "${word}"; use ${listWords(words)}`,
    )
  return {
    number: header.number,
    tier: header.tier,
    word: word as keyof Words & string,
  }
}

function readVetHeader(line: string): VetHeader | null {
  const header = readHeaderLine(line)
  if (header === null) return null
  const revised = /^Revise to \[([A-D])\]$/.exec(header.word)
  if (revised !== null) {
    const revisedTier = revised[1] as FindingReview["tier"]
    if (revisedTier === header.tier)
      throw new Error(
        `Vet verdict ${header.number} keeps tier ${revisedTier}; use Revise without a tier`,
      )
    return { ...header, word: "Revise", revisedTier }
  }
  if (header.word.startsWith("Revise to "))
    throw new Error(
      `Vet verdict ${header.number} has malformed revised tier; use Revise to [A], [B], [C] or [D]`,
    )
  if (/ to \[.+\]$/.test(header.word))
    throw new Error("Only Revise may name a replacement tier")
  if (!Object.hasOwn(vetVerdicts, header.word))
    throw new Error(
      `Vet verdict ${header.number} uses the word "${header.word}"; use ${listWords(vetVerdicts)}`,
    )
  return {
    ...header,
    word: header.word as keyof typeof vetVerdicts & string,
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
    const header = readVetHeader(line)
    if (header === null) continue
    checkFindingIdentity(header.number, header.tier, findings)
    reviews.push({
      number: header.number,
      tier: header.tier,
      verdict: vetVerdicts[header.word],
      ...(header.revisedTier === undefined
        ? {}
        : { revisedTier: header.revisedTier }),
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

/**
 * Read the numbered subset of findings the auditor answered after vetting.
 * An answer numbered for an accepted finding is refused by name, so a
 * misnumbered answer fails on its own line instead of as a missing one.
 */
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
    if (
      reviews.find((review) => review.number === header.number)?.verdict ===
      "accept"
    )
      throw new Error(
        `Rebuttal answer ${header.number} names an accepted finding; copy the number from the verdict it answers`,
      )
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

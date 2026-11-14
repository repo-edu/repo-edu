import type { ReportFindings } from "./report.js"
import type {
  FindingRebuttal,
  FindingReview,
  PanelVet,
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

type RebuttalHeader = Header<keyof typeof rebuttalAnswers & string> & {
  readonly vet: string
}

/**
 * A verdict or answer header starts `<number>. [<tier>] <word>`. A revised vet
 * tier is the one admitted suffix, and a rebuttal answer names its vet's tag in
 * brackets before the word. A line in that shape whose word is outside the
 * phase's list is refused by name rather than passed as free text, so a vet
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

function readRebuttalHeader(line: string): RebuttalHeader | null {
  const header = readHeaderLine(line)
  if (header === null) return null
  const tagged = /^\[([^\]]+)\] (.+)$/.exec(header.word)
  if (tagged === null)
    throw new Error(
      `Rebuttal answer ${header.number} names no vet; put the vet's tag in brackets after the tier`,
    )
  const word = tagged[2] as string
  if (!Object.hasOwn(rebuttalAnswers, word))
    throw new Error(
      `Rebuttal answer ${header.number} uses the word "${word}"; use ${listWords(Object.keys(rebuttalAnswers))}`,
    )
  return {
    number: header.number,
    tier: header.tier,
    vet: tagged[1] as string,
    word: word as keyof typeof rebuttalAnswers & string,
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
      `Vet verdict ${header.number} uses the word "${header.word}"; use ${listWords(Object.keys(vetVerdicts))}`,
    )
  return {
    ...header,
    word: header.word as keyof typeof vetVerdicts & string,
  }
}

function listWords(names: readonly string[]): string {
  return names.length === 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`
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
 * Read the answers the auditor gave the panel after vetting. Each answer line
 * names the vet it answers, so the reader takes the vet from the line alone.
 * Answers follow report order and, within one finding, panel order. An answer
 * to a vet outside the panel or to a verdict that accepted the finding is
 * refused by name, so a misnumbered or mistagged answer fails on its own line
 * instead of as a missing one.
 */
export function readRebuttal(
  source: string,
  findings: ReportFindings,
  panel: readonly PanelVet[],
): readonly FindingRebuttal[] {
  const position = new Map(panel.map(({ vet }, index) => [vet, index]))
  const rebuttals: FindingRebuttal[] = []
  const order = (rebuttal: Pick<FindingRebuttal, "number" | "vet">) =>
    rebuttal.number * panel.length + (position.get(rebuttal.vet) ?? 0)
  for (const line of source.split(/\r?\n/)) {
    const header = readRebuttalHeader(line)
    if (header === null) continue
    checkFindingIdentity(header.number, header.tier, findings)
    const vet = panel.find((candidate) => candidate.vet === header.vet)
    if (vet === undefined)
      throw new Error(
        `Rebuttal answer ${header.number} names ${header.vet}, which is no vet of this round; use ${listWords(panel.map(({ vet }) => vet))}`,
      )
    if (
      vet.reviews.find((review) => review.number === header.number)?.verdict ===
      "accept"
    )
      throw new Error(
        `Rebuttal answer ${header.number} names ${header.vet}, which accepted finding ${header.number}; an accept needs no answer`,
      )
    if (
      rebuttals.some(
        (rebuttal) =>
          rebuttal.number === header.number && rebuttal.vet === header.vet,
      )
    )
      throw new Error(
        `Rebuttal answers ${header.vet} on finding ${header.number} more than once`,
      )
    const previous = rebuttals.at(-1)
    if (previous !== undefined && order(previous) >= order(header))
      throw new Error(
        "Rebuttal answers must follow report order, then panel order",
      )
    rebuttals.push({
      number: header.number,
      tier: header.tier,
      vet: header.vet,
      answer: rebuttalAnswers[header.word],
    })
  }
  for (const finding of findings)
    for (const { vet, reviews } of panel) {
      const review = reviews.find(
        (candidate) => candidate.number === finding.number,
      )
      if (
        review !== undefined &&
        review.verdict !== "accept" &&
        !rebuttals.some(
          (rebuttal) =>
            rebuttal.number === finding.number && rebuttal.vet === vet,
        )
      )
        throw new Error(
          `Rebuttal needs an answer to ${vet} on finding ${finding.number}`,
        )
    }
  return rebuttals
}

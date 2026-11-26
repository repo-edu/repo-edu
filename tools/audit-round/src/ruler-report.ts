import { z } from "zod"
import { type FindingIdentity, oneLine } from "./report.js"
import type { RulingWinner } from "./round-data.js"

export type RulerWinner = FindingIdentity & {
  readonly winner: RulingWinner
  readonly reason: string
  readonly choice: string | null
}

export type RulerReading = {
  readonly winners: readonly RulerWinner[]
  readonly sources: readonly string[]
}

const source = z.strictObject({
  source: z
    .string()
    .regex(/^(?:\/[^\s`][^`\r\n]*|[0-9a-f]{6})$/)
    .describe("An absolute file path or a six-character commit ID"),
  place: oneLine.nullable().describe("The location in the source"),
})

const point = z.strictObject({
  question: oneLine.describe("The disputed point"),
  sources: z.array(source).describe("The sources opened for this point"),
  record: z.string().describe("The evidence record for this point in Markdown"),
})

export function rulerSchema(
  given: readonly FindingIdentity[],
  panel: readonly string[],
) {
  const entry = z.strictObject({
    points: z.array(point).min(1),
    winner: z.union([
      z.enum(["report", "neither"]),
      z.array(z.enum(panel)).min(1),
    ]),
    reason: oneLine.describe("The winner's reason"),
    openChoice: oneLine
      .nullable()
      .describe("The question left open for the user"),
  })
  return z.strictObject({
    headDrift: z.string().describe("The note on head drift in Markdown"),
    findings: z.strictObject(
      Object.fromEntries(given.map(({ number }) => [number, entry])),
    ),
  })
}

export function rulerReport(
  given: readonly FindingIdentity[],
  answer: z.infer<ReturnType<typeof rulerSchema>>,
): { readonly text: string; readonly reading: RulerReading } {
  const entries = given.map(({ number, tier }) => {
    const { points, winner, reason, openChoice } =
      answer.findings[String(number)]
    const openedSources = points.flatMap(({ sources }) =>
      sources.map(({ source }) => source),
    )
    if (openedSources.length === 0)
      throw new Error(`Ruler finding ${number} names no opened source`)
    const evidence = points.map(({ question, sources, record }, index) =>
      [
        `Point ${index + 1}: ${question}`,
        ...sources.map(
          ({ source, place }) =>
            `- Opened: \`${source}\`${place === null ? "." : `, ${place}`}`,
        ),
        ...(record.trim() ? ["", record.trim()] : []),
      ].join("\n"),
    )
    return {
      winner: { number, tier, winner, reason, choice: openChoice },
      sources: openedSources,
      text: [
        `### ${number}. [${tier}]`,
        ...evidence,
        [
          `Winner: ${typeof winner === "string" ? winner : winner.join(",")}. ${reason}`,
          openChoice === null ? "" : `Open choice: ${openChoice}`,
        ]
          .filter(Boolean)
          .join("\n"),
      ].join("\n\n"),
    }
  })
  return {
    text: [answer.headDrift.trim(), ...entries.map(({ text }) => text)]
      .filter(Boolean)
      .join("\n\n"),
    reading: {
      winners: entries.map(({ winner }) => winner),
      sources: [...new Set(entries.flatMap(({ sources }) => sources))],
    },
  }
}

/** Match sources against actual tool invocations and files supplied whole. */
export function unopenedSources(
  sources: readonly string[],
  toolLines: readonly string[],
  supplied: readonly string[],
): readonly string[] {
  return sources.filter(
    (source) =>
      !supplied.includes(source) &&
      !toolLines.some((line) => line.includes(source)),
  )
}

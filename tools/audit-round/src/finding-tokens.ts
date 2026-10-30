import { z } from "zod"

/** Closed finding reaches in the rate summary's display order. */
export const reachValues = [
  "ordinary",
  "rare",
  "very-rare",
  "developer",
] as const

/** Closed finding complexity values from removal through addition. */
export const complexityValues = [
  "minus-high",
  "minus-medium",
  "minus-low",
  "none",
  "low",
  "medium",
  "high",
] as const

export const reachSchema = z.enum(reachValues)
export const complexitySchema = z.enum(complexityValues)
export const findingLabelSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const growthPatternSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:,[a-z0-9]+(?:-[a-z0-9]+)*)*$/)

export const findingRatingsSchema = z.strictObject({
  "growth-pattern": growthPatternSchema,
  reach: reachSchema,
  complexity: complexitySchema,
})

export type FindingToken = {
  readonly key: string
  readonly value: string
}

export const findingTokenKeys = [
  "finding",
  "field",
  "section",
  "area",
  "cover",
  "plan",
  "growth-pattern",
  "reach",
  "complexity",
] as const

export type FindingTokenKey = (typeof findingTokenKeys)[number]

const findingTokenKeySet = new Set<string>(findingTokenKeys)
const locationTokenKeySet = new Set<string>([
  "section",
  "area",
  "cover",
  "plan",
])

export const findingRatingTokenKeys = [
  "growth-pattern",
  "reach",
  "complexity",
] as const satisfies readonly FindingTokenKey[]

export type FindingTokenPrefix = {
  readonly tokens: readonly FindingToken[]
  readonly remainder: string
}

/**
 * Read the shared `[key:value]` token sequence at the start of a finding line.
 * Report findings require an empty remainder; record bullets require prose.
 */
export function readFindingTokenPrefix(
  source: string,
): FindingTokenPrefix | null {
  const prefix = /^((?:\[[a-z-]+:[^\]\n]*\](?: |$))+)(.*)$/.exec(source)
  if (prefix === null) return null
  return {
    tokens: [...prefix[1].matchAll(/\[([^:\]]+):([^\]]*)\]/g)].map((token) => ({
      key: token[1],
      value: token[2],
    })),
    remainder: prefix[2],
  }
}

export function findingTokenValues(
  tokens: readonly FindingToken[],
  key: string,
): readonly string[] {
  return tokens.filter((token) => token.key === key).map((token) => token.value)
}

/** Name the first token that departs from one exact grammar production. */
export function findingTokenSequenceIssue(
  tokens: readonly FindingToken[],
  expected: readonly FindingTokenKey[],
): string | null {
  const unknownIndex = tokens.findIndex(
    (token) => !findingTokenKeySet.has(token.key),
  )
  if (unknownIndex !== -1)
    return `unknown [${tokens[unknownIndex].key}:...] token at ${unknownIndex + 1}`

  const mismatch = Math.max(tokens.length, expected.length)
  for (let index = 0; index < mismatch; index += 1) {
    const actual = tokens[index]?.key
    const wanted = expected[index]
    if (actual === wanted) continue
    if (actual === undefined)
      return `missing [${wanted}:...] token at ${index + 1}`
    if (wanted === undefined)
      return `unexpected [${actual}:...]${locationTokenKeySet.has(actual) ? " location" : ""} token at ${index + 1}`
    const location = locationTokenKeySet.has(actual)
      ? " location"
      : locationTokenKeySet.has(wanted)
        ? " location"
        : ""
    return `unexpected [${actual}:...]${location} at ${index + 1}; expected [${wanted}:...]`
  }
  return null
}

/** Read one area token and the cover tokens directly after it. */
export function areaLocationTokenKeys(
  tokens: readonly FindingToken[],
  areaIndex: number,
): readonly FindingTokenKey[] {
  const keys: FindingTokenKey[] = ["area"]
  for (let index = areaIndex + 1; tokens[index]?.key === "cover"; index += 1)
    keys.push("cover")
  return keys
}

export type ReportLocationToken = "section" | "area" | "plan"
export type ReportLocationAdmission =
  | "plan"
  | "repo-edu"
  | "deferred-plan"
  | "deferred-repo-edu"

export type ReportLocationCell =
  | {
      readonly caseId: string
      readonly outcome: "parsed"
      readonly admission: ReportLocationAdmission
    }
  | {
      readonly caseId: string
      readonly outcome: "refused"
      readonly refusal: "invalid plan deferral" | "invalid plan location"
    }

export type JudgedRepositorySet = "plan" | "repo-edu" | "plan, repo-edu"

/** The report grammar's complete judged-set/location decision table. */
export const reportLocationTable = {
  plan: {
    section: {
      caseId: "report/location-plan-section",
      outcome: "parsed",
      admission: "plan",
    },
    area: {
      caseId: "report/location-plan-area",
      outcome: "parsed",
      admission: "deferred-repo-edu",
    },
    plan: {
      caseId: "report/location-plan-plan",
      outcome: "refused",
      refusal: "invalid plan deferral",
    },
  },
  "repo-edu": {
    section: {
      caseId: "report/location-repo-edu-section",
      outcome: "refused",
      refusal: "invalid plan location",
    },
    area: {
      caseId: "report/location-repo-edu-area",
      outcome: "parsed",
      admission: "repo-edu",
    },
    plan: {
      caseId: "report/location-repo-edu-plan",
      outcome: "parsed",
      admission: "deferred-plan",
    },
  },
  "plan, repo-edu": {
    section: {
      caseId: "report/location-both-section",
      outcome: "parsed",
      admission: "plan",
    },
    area: {
      caseId: "report/location-both-area",
      outcome: "parsed",
      admission: "repo-edu",
    },
    plan: {
      caseId: "report/location-both-plan",
      outcome: "refused",
      refusal: "invalid plan deferral",
    },
  },
} as const satisfies Record<
  JudgedRepositorySet,
  Record<ReportLocationToken, ReportLocationCell>
>

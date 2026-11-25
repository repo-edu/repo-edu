import { z } from "zod"

/** Who meets a finding's harm: a person using a shipped program, or the developer. */
export const reachValues = ["end-user", "developer"] as const

/** How many independent rare conditions must hold at once before the harm appears. */
export const rarityValues = [
  "ordinary",
  "rare",
  "very-rare",
  "extremely-rare",
] as const

/** How bad the harm is, rated only on a finding whose rarity is not ordinary. */
export const harmValues = ["low", "medium", "high"] as const

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
export const raritySchema = z.enum(rarityValues)
export const harmSchema = z.enum(harmValues)
export const complexitySchema = z.enum(complexityValues)
export const findingLabelSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const growthPatternSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:,[a-z0-9]+(?:-[a-z0-9]+)*)*$/)

/**
 * A harm level stands exactly on a finding whose rarity is not ordinary, so a
 * forgotten level is refused and never read as a floor.
 */
export const findingRatingsSchema = z
  .strictObject({
    "growth-pattern": growthPatternSchema,
    reach: reachSchema,
    rarity: raritySchema,
    harm: harmSchema.optional(),
    complexity: complexitySchema,
  })
  .superRefine((ratings, context) => {
    if (ratings.rarity === "ordinary" && ratings.harm !== undefined)
      context.addIssue({
        code: "custom",
        message: "a [harm:...] token after [rarity:ordinary]",
        path: ["harm"],
      })
    if (ratings.rarity !== "ordinary" && ratings.harm === undefined)
      context.addIssue({
        code: "custom",
        message: `no [harm:...] token after [rarity:${ratings.rarity}]`,
        path: ["harm"],
      })
  })

export type FindingRatings = z.infer<typeof findingRatingsSchema>

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
  "applies",
  "growth-pattern",
  "reach",
  "rarity",
  "harm",
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

/**
 * The rating tokens from `start` in grammar order. A harm token keeps its
 * place after the rarity whenever one stands there; the ratings check decides
 * whether the rarity requires or refuses it.
 */
export function findingRatingTokenKeys(
  tokens: readonly FindingToken[],
  start: number,
): readonly FindingTokenKey[] {
  return tokens[start + 3]?.key === "harm"
    ? ["growth-pattern", "reach", "rarity", "harm", "complexity"]
    : ["growth-pattern", "reach", "rarity", "complexity"]
}

/** Check one finding's rating values, or name the first that breaks the grammar. */
export function readFindingRatings(
  tokens: readonly FindingToken[],
  fail: (reason: string) => never,
): FindingRatings {
  const value = (key: FindingTokenKey) => findingTokenValues(tokens, key)[0]
  const harm = value("harm")
  const checked = findingRatingsSchema.safeParse({
    "growth-pattern": value("growth-pattern"),
    reach: value("reach"),
    rarity: value("rarity"),
    ...(harm === undefined ? {} : { harm }),
    complexity: value("complexity"),
  })
  if (checked.success) return checked.data
  const issue = checked.error.issues[0]
  fail(
    issue.code === "custom"
      ? issue.message
      : `invalid [${String(issue.path[0])}:...]: ${issue.message}`,
  )
}

export type FindingTokenPrefix = {
  readonly tokens: readonly FindingToken[]
  readonly remainder: string
}

/**
 * Read the shared `[key:value]` token sequence at the start of a finding line.
 * Record bullets require prose after the tokens.
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

/** Read the citation tokens directly after one record location. */
export function deferralCitationTokenKeys(
  tokens: readonly FindingToken[],
  citationIndex: number,
): readonly FindingTokenKey[] {
  const keys: FindingTokenKey[] = []
  for (let index = citationIndex; tokens[index]?.key === "applies"; index += 1)
    keys.push("applies")
  return keys
}

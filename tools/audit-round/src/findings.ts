import { z } from "zod"
import {
  areaLocationTokenKeys,
  deferralCitationTokenKeys,
  findingLabelSchema,
  findingRatingsSchema,
  findingRatingTokenKeys,
  findingTokenSequenceIssue,
  findingTokenValues,
  readFindingTokenPrefix,
} from "./finding-tokens.js"
import { type Repository, SubjectError, type TierLetter } from "./subject.js"

export type Finding = Omit<
  z.infer<typeof findingRatingsSchema>,
  "growth-pattern"
> & {
  /** The growth-pattern labels the flagged work could violate, comma-joined, or `none`. */
  readonly growthPattern: string
  readonly tier: TierLetter
  /** The report finding this bullet lands, or null for work no report finding asked for. */
  readonly number: number | null
  /** The short title before the bullet's explanatory colon. */
  readonly title: string
  readonly location: { readonly key: string; readonly value: string }
  readonly deferred: boolean
  readonly field: string | null
  readonly covers: readonly string[]
  readonly applies: readonly DeferralCitation[]
  readonly text: string
  readonly line: number
}

export type DeferralCitation = {
  readonly sha: string
  readonly position: number
}

export type StandingCitation = {
  readonly applies: readonly DeferralCitation[]
  readonly text: string
  readonly line: number
}

export type RecordBullet = Finding | StandingCitation

export const standingCitationReason = "The plan stands."

function readDeferralCitations(
  values: readonly string[],
  fail: (reason: string) => never,
): readonly DeferralCitation[] {
  return values.map((value) => {
    const parsed = /^([0-9a-f]{40})\/([1-9]\d*)$/.exec(value)
    if (parsed === null)
      fail(
        `invalid [applies:${value}] value; expected 40 lowercase commit sha characters and a position from 1`,
      )
    return { sha: parsed[1], position: Number(parsed[2]) }
  })
}

/** Read the current graded and untiered record-bullet forms. */
export function readRecordBullets(
  body: string,
  repository: Repository,
  role: string | null,
): RecordBullet[] {
  const bullets: RecordBullet[] = []
  const opening =
    repository === "repo-edu" ? /^- \[([A-D])\]/ : /^- ([A-D])(?= \[)/
  for (const [index, line] of body.split("\n").entries()) {
    const start = opening.exec(line)
    if (start === null) {
      if (!line.startsWith("- [applies:")) continue
      const fail: (reason: string) => never = (reason) => {
        throw new SubjectError(
          `citation bullet on body line ${index + 1} (${line}): ${reason}`,
        )
      }
      const prefix = readFindingTokenPrefix(line.slice(2))
      if (prefix === null || prefix.remainder.trim().length === 0)
        fail("needs one or more applies tokens followed by the fixed reason")
      const tokenIssue = findingTokenSequenceIssue(
        prefix.tokens,
        deferralCitationTokenKeys(prefix.tokens, 0),
      )
      if (tokenIssue !== null) fail(tokenIssue)
      const applies = readDeferralCitations(
        findingTokenValues(prefix.tokens, "applies"),
        fail,
      )
      if (applies.length === 0) fail("needs at least one [applies:...] token")
      if (prefix.remainder !== standingCitationReason)
        fail(`must say exactly "${standingCitationReason}"`)
      bullets.push({ applies, text: line, line: index + 1 })
      continue
    }
    const fail: (reason: string) => never = (reason) => {
      throw new SubjectError(
        `finding bullet on body line ${index + 1} (${line}): ${reason}`,
      )
    }
    const remainder = line.slice(start[0].length)
    const prefix = remainder.startsWith(" ")
      ? readFindingTokenPrefix(remainder.slice(1))
      : null
    if (prefix === null || prefix.remainder.trim().length === 0)
      fail(
        "needs location, growth-pattern, reach and complexity tokens followed by prose",
      )
    const { tokens } = prefix
    const planning = repository === "plan" && role === "plan-audit"
    const numbered = tokens[0]?.key === "finding"
    const number = numbered ? Number(tokens[0].value) : null
    if (numbered && !/^[1-9]\d*$/.test(tokens[0].value))
      fail("needs a report finding number from 1 in [finding:...]")
    const first = numbered ? 1 : 0
    const locationTokenKeys =
      repository === "repo-edu"
        ? tokens[first]?.key === "plan"
          ? (["plan"] as const)
          : areaLocationTokenKeys(tokens, first)
        : planning
          ? tokens[first + 1]?.key === "area"
            ? (["field", ...areaLocationTokenKeys(tokens, first + 1)] as const)
            : (["field", "section"] as const)
          : tokens[first]?.key === "section"
            ? (["section"] as const)
            : areaLocationTokenKeys(tokens, first)
    const expectedTokenKeys = numbered
      ? ([
          "finding",
          ...locationTokenKeys,
          ...deferralCitationTokenKeys(
            tokens,
            first + locationTokenKeys.length,
          ),
        ] as const)
      : ([
          ...locationTokenKeys,
          ...deferralCitationTokenKeys(tokens, locationTokenKeys.length),
        ] as const)
    const completeTokenKeys = [
      ...expectedTokenKeys,
      ...findingRatingTokenKeys,
    ] as const
    const tokenIssue = findingTokenSequenceIssue(tokens, completeTokenKeys)
    if (tokenIssue !== null) {
      if (
        repository === "plan" &&
        !planning &&
        tokens.some((token) => token.key === "field")
      )
        fail("[field:...] belongs only to a planning audit")
      fail(tokenIssue)
    }
    const values = (key: string) => findingTokenValues(tokens, key)
    const applies = readDeferralCitations(values("applies"), fail)
    const key = repository === "repo-edu" ? "area" : "section"
    const foreignKey = repository === "repo-edu" ? "plan" : "area"
    const local = values(key)
    const foreign = values(foreignKey)
    const deferred = foreign.length > 0
    const located = deferred
      ? local.length === 0 &&
        foreign.length === 1 &&
        foreign[0].trim().length > 0
      : local.length === 1 && findingLabelSchema.safeParse(local[0]).success
    if (
      !located ||
      values(repository === "repo-edu" ? "section" : "plan").length > 0
    )
      fail(
        `needs one [${key}:...] location; a deferred finding has only [${foreignKey}:...]`,
      )
    const location = {
      key: deferred ? foreignKey : key,
      value: (deferred ? foreign : local)[0],
    }
    for (const area of [...values("area"), ...values("cover")])
      if (!findingLabelSchema.safeParse(area).success)
        fail(`invalid area ID: ${area}`)
    const checked = findingRatingsSchema.safeParse({
      "growth-pattern": values("growth-pattern")[0],
      reach: values("reach")[0],
      complexity: values("complexity")[0],
    })
    if (!checked.success) {
      const issue = checked.error.issues[0]
      fail(`invalid [${String(issue.path[0])}:...]: ${issue.message}`)
    }
    if (
      planning &&
      !z.enum(["excess", "missing"]).safeParse(values("field")[0]).success
    )
      fail("[field:...] must be excess or missing")
    const separator = prefix.remainder.indexOf(": ")
    if (
      separator < 1 ||
      prefix.remainder.slice(separator + 2).trim().length === 0
    )
      fail('needs the `Title: prose` form, a title before the first ": "')
    bullets.push({
      growthPattern: checked.data["growth-pattern"],
      reach: checked.data.reach,
      complexity: checked.data.complexity,
      tier: start[1].toLowerCase() as TierLetter,
      number,
      title: prefix.remainder.slice(0, separator),
      location,
      deferred,
      field: values("field")[0] ?? null,
      covers: values("cover"),
      applies,
      text: line,
      line: index + 1,
    })
  }
  return bullets
}

/** Read only graded findings while still validating untiered citation bullets. */
export function readFindings(
  body: string,
  repository: Repository,
  role: string | null,
): Finding[] {
  return readRecordBullets(body, repository, role).filter(
    (bullet): bullet is Finding => "tier" in bullet,
  )
}

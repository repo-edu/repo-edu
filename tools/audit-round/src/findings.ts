import { z } from "zod"
import {
  areaLocationTokenKeys,
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
  readonly text: string
  readonly line: number
}

/** Read the current fixed bullet form. Area existence is a write-time rule. */
export function readFindings(
  body: string,
  repository: Repository,
  role: string | null,
): Finding[] {
  const findings: Finding[] = []
  const opening =
    repository === "repo-edu" ? /^- \[([A-D])\]/ : /^- ([A-D])(?= \[)/
  for (const [index, line] of body.split("\n").entries()) {
    const start = opening.exec(line)
    if (start === null) continue
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
          ? (["plan", ...findingRatingTokenKeys] as const)
          : ([
              ...areaLocationTokenKeys(tokens, first),
              ...findingRatingTokenKeys,
            ] as const)
        : planning
          ? tokens[first + 1]?.key === "area"
            ? ([
                "field",
                ...areaLocationTokenKeys(tokens, first + 1),
                ...findingRatingTokenKeys,
              ] as const)
            : (["field", "section", ...findingRatingTokenKeys] as const)
          : tokens[first]?.key === "section"
            ? (["section", ...findingRatingTokenKeys] as const)
            : ([
                ...areaLocationTokenKeys(tokens, first),
                ...findingRatingTokenKeys,
              ] as const)
    const expectedTokenKeys = numbered
      ? (["finding", ...locationTokenKeys] as const)
      : locationTokenKeys
    const tokenIssue = findingTokenSequenceIssue(tokens, expectedTokenKeys)
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
    findings.push({
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
      text: line,
      line: index + 1,
    })
  }
  return findings
}

import { z } from "zod"
import { type Repository, SubjectError, type TierLetter } from "./subject.js"

const label = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const ratings = z.object({
  growth: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:,[a-z0-9]+(?:-[a-z0-9]+)*)*$/),
  reach: z.enum(["developer", "very-rare", "rare", "ordinary"]),
  complexity: z.enum([
    "minus-high",
    "minus-medium",
    "minus-low",
    "none",
    "low",
    "medium",
    "high",
  ]),
})

export type Finding = z.infer<typeof ratings> & {
  readonly tier: TierLetter
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
    const prefix = /^ ((?:\[[^\]\n]+\](?: |$))+)(.*)$/.exec(remainder)
    if (prefix === null || prefix[2].trim().length === 0)
      fail(
        "needs location, growth, reach and complexity tokens followed by prose",
      )
    const tokens = [...prefix[1].matchAll(/\[([^:\]]+):([^\]]*)\]/g)]
    const values = (key: string) =>
      tokens.filter((token) => token[1] === key).map((token) => token[2])
    const key = repository === "repo-edu" ? "area" : "section"
    const foreignKey = repository === "repo-edu" ? "plan" : "area"
    const local = values(key)
    const foreign = values(foreignKey)
    const deferred = foreign.length > 0
    const located = deferred
      ? local.length === 0 &&
        foreign.length === 1 &&
        foreign[0].trim().length > 0
      : local.length === 1 && label.safeParse(local[0]).success
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
      if (!label.safeParse(area).success) fail(`invalid area ID: ${area}`)
    const planning = repository === "plan" && role === "audit"
    for (const token of [
      "growth",
      "reach",
      "complexity",
      ...(planning ? ["field"] : []),
    ]) {
      if (values(token).length !== 1)
        fail(`needs exactly one [${token}:...] token`)
    }
    const checked = ratings.safeParse(
      Object.fromEntries(tokens.map((token) => [token[1], token[2]])),
    )
    if (!checked.success) {
      const issue = checked.error.issues[0]
      fail(`invalid [${String(issue.path[0])}:...]: ${issue.message}`)
    }
    if (
      planning &&
      !z.enum(["excess", "missing"]).safeParse(values("field")[0]).success
    )
      fail("[field:...] must be excess or missing")
    if (repository === "plan" && !planning && values("field").length > 0)
      fail("[field:...] belongs only to a planning audit")
    findings.push({
      ...checked.data,
      tier: start[1].toLowerCase() as TierLetter,
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

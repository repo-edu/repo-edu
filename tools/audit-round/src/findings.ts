import { z } from "zod"
import {
  type Repository,
  type Subject,
  SubjectError,
  type TierLetter,
} from "./subject.js"

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

export type Finding = {
  readonly tier: TierLetter
  readonly location: { readonly key: string; readonly value: string }
  readonly deferred: boolean
  readonly field: string | null
  readonly growth: string | null
  readonly reach: string | null
  readonly complexity: string | null
}

type ReadMode =
  | { readonly strict: true; readonly primaryAreas: ReadonlySet<string> }
  | { readonly strict: false }

/**
 * Read the fixed bullet prefixes, not the prose. Strict writes require the
 * complete current form. Historical reads retain the old A–C location checks
 * and ignore rating tokens and D bullets, which never counted in the glance.
 */
export function readFindings(
  body: string,
  repository: Repository,
  mode: ReadMode,
): Finding[] {
  const findings: Finding[] = []
  const opening = mode.strict
    ? repository === "repo-edu"
      ? /^- \[([A-D])\](?: |$)/
      : /^- ([A-D])(?: |$)/
    : /^- (?:\[([A-C])\]|([A-C])) /
  for (const [index, line] of body.split("\n").entries()) {
    const start = opening.exec(line)
    if (start === null) continue
    const fail = (reason: string): never => {
      throw new SubjectError(
        `finding bullet on body line ${index + 1} (${line}): ${reason}`,
      )
    }
    const remainder = line.slice(start[0].length)
    const prefix = mode.strict
      ? /^((?:\[[^\]\n]+\](?: |$))+)(.*)$/.exec(remainder)
      : /^((?:\[[^\]\n]+\] )+)\S/.exec(remainder)
    if (prefix === null || (mode.strict && prefix[2].trim().length === 0)) {
      if (mode.strict)
        fail(
          "needs location, growth, reach and complexity tokens followed by prose",
        )
      continue
    }
    const tokens = [...prefix[1].matchAll(/\[([^:\]]+):([^\]]*)\]/g)].filter(
      (token) => mode.strict || token[2].length > 0,
    )
    const values = (key: string) =>
      tokens.filter((token) => token[1] === key).map((token) => token[2])
    const key = repository === "repo-edu" ? "area" : "section"
    const foreignKey = repository === "repo-edu" ? "plan" : "area"
    const local = values(key)
    const foreign = values(foreignKey)
    const deferred = foreign.length > 0
    const located = deferred
      ? local.length === 0 &&
        (!mode.strict || (foreign.length === 1 && foreign[0].trim().length > 0))
      : local.length === 1 && label.safeParse(local[0]).success
    if (
      !located ||
      (mode.strict &&
        values(repository === "repo-edu" ? "section" : "plan").length > 0)
    )
      fail(
        `needs one [${key}:...] location; a deferred finding has only [${foreignKey}:...]`,
      )
    const location = {
      key: deferred ? foreignKey : key,
      value: (deferred ? foreign : local)[0],
    }
    if (
      mode.strict &&
      !deferred &&
      repository === "repo-edu" &&
      !mode.primaryAreas.has(location.value)
    )
      fail(`unknown primary area: ${location.value}`)
    if (mode.strict) {
      for (const token of [
        "growth",
        "reach",
        "complexity",
        ...(repository === "plan" ? ["field"] : []),
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
        repository === "plan" &&
        !z.enum(["excess", "missing"]).safeParse(values("field")[0]).success
      )
        fail("[field:...] must be excess or missing")
    }
    findings.push({
      tier: (start[1] ?? start[2]).toLowerCase() as TierLetter,
      location,
      deferred,
      field: values("field")[0] ?? null,
      growth: values("growth")[0] ?? null,
      reach: values("reach")[0] ?? null,
      complexity: values("complexity")[0] ?? null,
    })
  }
  return findings
}

/** Historical correction counts keep their tier totals and location checks. */
export function correctionAreas(
  subject: Subject,
  body: string,
  repository: Repository,
): ReadonlySet<string> {
  const areas = new Set<string>()
  const sequence = subject.severity
  if (sequence === null || sequence === "clean" || subject.class === "I3")
    return areas
  const expected = new Map<string, number>()
  for (const run of [...sequence.upper, ...sequence.lower]) {
    if (run.tier !== "d")
      expected.set(run.tier, (expected.get(run.tier) ?? 0) + run.count)
  }
  if (expected.size === 0) return areas
  const found = new Map<string, number>()
  for (const finding of readFindings(body, repository, { strict: false })) {
    found.set(finding.tier, (found.get(finding.tier) ?? 0) + 1)
    if (!finding.deferred)
      areas.add(`${finding.location.key}:${finding.location.value}`)
  }
  for (const tier of ["a", "b", "c"]) {
    if ((found.get(tier) ?? 0) !== (expected.get(tier) ?? 0))
      throw new SubjectError(
        `the body needs one tier-and-location bullet per A–C finding; ${tier.toUpperCase()} has ${found.get(tier) ?? 0}, subject has ${expected.get(tier) ?? 0}`,
      )
  }
  return areas
}

import { type Repository, type Subject, SubjectError } from "./subject.js"

/**
 * Read the fixed finding prefixes in commit bodies. Repo Edu uses `[C]` and
 * `[area:id]`; planning uses `C` and `[section:heading]`. Other body text is
 * not interpreted. The hook and glance share this read so they count the
 * same corrections. A finding deferred to the other repo adds no local area.
 * The hook supplies current primary IDs; the glance omits them so retired
 * IDs in historical commits still count.
 */
export function correctionAreas(
  subject: Subject,
  body: string,
  repository: Repository,
  primaryAreas?: ReadonlySet<string>,
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
  for (const line of body.split("\n")) {
    const finding = /^- (?:\[([A-C])\]|([A-C])) ((?:\[[^\]\n]+\] )+)\S/.exec(
      line,
    )
    if (finding === null) continue
    const tier = (finding[1] ?? finding[2]).toLowerCase()
    const tokens = finding[3]
    const key = repository === "repo-edu" ? "area" : "section"
    const foreignKey = repository === "repo-edu" ? "plan" : "area"
    const locations = [...tokens.matchAll(/\[(area|section|plan):([^\]]+)\]/g)]
    const deferred = locations.some((m) => m[1] === foreignKey)
    const local = locations.filter((m) => m[1] === key)
    const located = deferred
      ? local.length === 0
      : local.length === 1 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(local[0][2])
    if (!located)
      throw new SubjectError(
        `each A–C finding needs one [${key}:...] location; a deferred finding has only [${foreignKey}:...]`,
      )
    if (
      !deferred &&
      key === "area" &&
      primaryAreas !== undefined &&
      !primaryAreas.has(local[0][2])
    )
      throw new SubjectError(`unknown primary area: ${local[0][2]}`)
    found.set(tier, (found.get(tier) ?? 0) + 1)
    if (!deferred) areas.add(`${key}:${local[0][2]}`)
  }
  for (const tier of ["a", "b", "c"]) {
    if ((found.get(tier) ?? 0) !== (expected.get(tier) ?? 0))
      throw new SubjectError(
        `the body needs one tier-and-location bullet per A–C finding; ${tier.toUpperCase()} has ${found.get(tier) ?? 0}, subject has ${expected.get(tier) ?? 0}`,
      )
  }
  return areas
}

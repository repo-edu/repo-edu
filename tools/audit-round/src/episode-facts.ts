import type { EpisodeCommit, EpisodeFinding } from "./episode.js"
import type { Subject, TierLetter } from "./subject.js"

export function trajectory(subject: Subject | null) {
  const severity = subject?.severity
  const upper = severity && severity !== "clean" ? severity.upper : []
  const lower = severity && severity !== "clean" ? severity.lower : []
  const counts = { a: 0, b: 0, c: 0, d: 0 }
  for (const run of [...upper, ...lower]) counts[run.tier] += run.count
  return {
    maximum:
      (["a", "b", "c", "d"] as const).find((tier) => counts[tier] > 0) ?? null,
    counts,
    upper,
    lower,
    ordinary: severity && severity !== "clean" ? severity.ordinary : false,
    structure: subject?.growth ?? null,
  }
}

/** Counts are per bullet. A split finding contributes once to each current area. */
export function tokenCounts(findings: readonly EpisodeFinding[]) {
  const counts: Record<
    "growth" | "reach" | "complexity" | "sections" | "areas" | "covers",
    Record<string, number>
  > = {
    growth: {},
    reach: {},
    complexity: {},
    sections: {},
    areas: {},
    covers: {},
  }
  const add = (kind: keyof typeof counts, key: string) => {
    counts[kind][key] =
      (Object.hasOwn(counts[kind], key) ? counts[kind][key] : 0) + 1
  }
  for (const finding of findings) {
    for (const label of new Set(finding.growth.split(","))) add("growth", label)
    add("reach", finding.reach)
    add("complexity", finding.complexity)
    if (finding.location.key === "section")
      add("sections", finding.location.value)
    for (const area of finding.areas) add("areas", area)
    for (const cover of finding.resolvedCovers) add("covers", cover)
  }
  return counts
}

/** Refuse partial counts while retaining the subject's independent trajectory. */
export function checkFindingTotals(
  subject: Subject | null,
  findings: readonly EpisodeFinding[],
): void {
  if (subject === null) return
  const expected = trajectory(subject).counts
  for (const tier of Object.keys(expected) as TierLetter[]) {
    const count = findings.filter((finding) => finding.tier === tier).length
    if (count !== expected[tier])
      throw new Error(
        `The body has ${count} ${tier.toUpperCase()} findings; the subject has ${expected[tier]}.`,
      )
  }
}

/** Evidence names commits, never deciding whether they concern the same machinery. */
export function repeatedGrowth(
  commits: readonly Pick<EpisodeCommit, "sha" | "findings">[],
) {
  const growth = new Map<string, string[]>()
  for (const commit of [...commits].reverse()) {
    for (const label of new Set(
      commit.findings.flatMap((finding) => finding.growth.split(",")),
    )) {
      if (label === "none") continue
      const shas = growth.get(label) ?? []
      shas.push(commit.sha)
      growth.set(label, shas)
    }
  }
  return [...growth]
    .filter(([, shas]) => shas.length >= 2)
    .map(([label, commits]) => ({ label, commits }))
}

export function runEvidence(commits: readonly EpisodeCommit[]) {
  const complexityRuns: string[][] = []
  let run: string[] = []
  const finish = () => {
    if (run.length >= 2) complexityRuns.push(run)
    run = []
  }
  // Run order follows time. Ungraded commits do not interrupt a run of graded work.
  for (const commit of [...commits].reverse()) {
    if (commit.unreadable !== null) {
      finish()
      continue
    }
    if (commit.findings.length === 0) continue
    if (
      commit.findings.some(
        (finding) =>
          finding.reach !== "ordinary" &&
          ["low", "medium", "high"].includes(finding.complexity),
      )
    )
      run.push(commit.sha)
    else finish()
  }
  finish()
  return {
    growth: repeatedGrowth(commits),
    complexity: complexityRuns,
  }
}
